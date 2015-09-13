var nostril_fov = 2*Math.PI/31; // 31 per revolution

var nostrils = [];
for (var x=1; x<=31; x++) {
  nostrils.push('nostril_'+x);
}

var config = {
  sensors: {
    eyes: {
      names: ['range_3l','range_2l','range_1l','range_0','range_1r','range_2r','range_3r'],
      fov: 15*Math.PI/180, // 15deg
      range: 85,
      types: 1
    },
    nostrils: {
      names: nostrils,
      fov: nostril_fov,
      range: 750, // 425
      types: 1
    }
  },
  actions: [
    [1.0,1.0],
    [1.0,0.5], // FIXME: 4 will work... less forward? pub some of these 1 time to see.
    [0.5,1.0],
    [0.5,0.0],
    [0.0,0.5]
  ]
};

  var canvas, ctx;

    // A 2D vector utility
    var Vec = function(x, y) {
      this.x = x;
      this.y = y;
    }
    Vec.prototype = {

      // utilities
      dist_from: function(v) { return Math.sqrt(Math.pow(this.x-v.x,2) + Math.pow(this.y-v.y,2)); },
      length: function() { return Math.sqrt(Math.pow(this.x,2) + Math.pow(this.y,2)); },

      // new vector returning operations
      add: function(v) { return new Vec(this.x + v.x, this.y + v.y); },
      sub: function(v) { return new Vec(this.x - v.x, this.y - v.y); },
      rotate: function(a) {  // CLOCKWISE
        return new Vec(this.x * Math.cos(a) + this.y * Math.sin(a),
                       -this.x * Math.sin(a) + this.y * Math.cos(a));
      },

      // in place operations
      scale: function(s) { this.x *= s; this.y *= s; },
      normalize: function() { var d = this.length(); this.scale(1.0/d); }
    }

    // line intersection helper function: does line segment (p1,p2) intersect segment (p3,p4) ?
    var line_intersect = function(p1,p2,p3,p4) {
      var denom = (p4.y-p3.y)*(p2.x-p1.x)-(p4.x-p3.x)*(p2.y-p1.y);
      if(denom===0.0) { return false; } // parallel lines
      var ua = ((p4.x-p3.x)*(p1.y-p3.y)-(p4.y-p3.y)*(p1.x-p3.x))/denom;
      var ub = ((p2.x-p1.x)*(p1.y-p3.y)-(p2.y-p1.y)*(p1.x-p3.x))/denom;
      if(ua>0.0&&ua<1.0&&ub>0.0&&ub<1.0) {
        var up = new Vec(p1.x+ua*(p2.x-p1.x), p1.y+ua*(p2.y-p1.y));
        return {ua:ua, ub:ub, up:up}; // up is intersection point
      }
      return false;
    }

    var line_point_intersect = function(p1,p2,p0,rad) {
      var v = new Vec(p2.y-p1.y,-(p2.x-p1.x)); // perpendicular vector
      var d = Math.abs((p2.x-p1.x)*(p1.y-p0.y)-(p1.x-p0.x)*(p2.y-p1.y));
      d = d / v.length();
      if(d > rad) { return false; }

      v.normalize();
      v.scale(d);
      var ua;
      var up = p0.add(v);
      if(Math.abs(p2.x-p1.x)>Math.abs(p2.y-p1.y)) {
        ua = (up.x - p1.x) / (p2.x - p1.x);
      } else {
        ua = (up.y - p1.y) / (p2.y - p1.y);
      }
      if(ua>0.0&&ua<1.0) {
        return {ua:ua, up:up};
      }
      return false;
    }

    // Wall is made up of two points
    var Wall = function(p1, p2) {
      this.p1 = p1;
      this.p2 = p2;
    }

    // World object contains many agents and walls and food and stuff
    var util_add_box = function(lst, x, y, w, h) {
      lst.push(new Wall(new Vec(x,y), new Vec(x+w,y)));
      lst.push(new Wall(new Vec(x+w,y), new Vec(x+w,y+h)));
      lst.push(new Wall(new Vec(x+w,y+h), new Vec(x,y+h)));
      lst.push(new Wall(new Vec(x,y+h), new Vec(x,y)));
    }

    // item is circle thing on the floor that agent can interact with (see or eat, etc)
    var Item = function(x, y, type) {
      this.p = new Vec(x, y); // position
      this.type = type;
      this.rad = 10; // default radius
      this.age = 0;
      this.cleanup_ = false;
    }

    var World = function() {
      this.agents = [];
      this.W = canvas.width;
      this.H = canvas.height;

      this.clock = 0;

      // set up walls in the world
      this.walls = [];
      var pad = 10;
      util_add_box(this.walls, pad, pad, this.W-pad*2, this.H-pad*2);
      util_add_box(this.walls, 100, 100, 200, 300); // inner walls
      this.walls.pop();
      util_add_box(this.walls, 400, 100, 200, 300);
      this.walls.pop();

      // set up food and poison
      this.items = [];

      this.goals = [];
    }

    World.prototype = {
      // helper function to get closest colliding walls/items
      stuff_collide_: function(p1, p2, check_walls, check_items) {
        var i,res;
        var minres = false;

        // collide with walls
        if(check_walls) {
          for(i=0,n=this.walls.length;i<n;i++) {
            var wall = this.walls[i];
            res = line_intersect(p1, p2, wall.p1, wall.p2);
            if(res) {
              res.type = 0; // 0 is wall
              if(!minres) { minres=res; }
              else {
                // check if its closer
                if(res.ua < minres.ua) {
                  // if yes replace it
                  minres = res;
                }
              }
            }
          }
        }

        // collide with items
        if(check_items) {
          for(i=0,n=this.items.length;i<n;i++) {
            var it = this.items[i];
            res = line_point_intersect(p1, p2, it.p, it.rad);
            if(res) {
              res.type = it.type; // store type of item
              if(!minres) { minres=res; }
              else { if(res.ua < minres.ua) { minres = res; }
              }
            }
          }
        }

        return minres;
      },
      tick: function() {
        var a,i,n,it;

        // tick the environment
        this.clock++;

        // fix input to all agents based on environment
        // process eyes
        this.collpoints = [];
        for(i=0,n=this.agents.length;i<n;i++) {
          a = this.agents[i];
          for(var ei=0,ne=a.sensors.eyes.length;ei<ne;ei++) {
            var e = a.sensors.eyes[ei];
            // we have a line from p to p->eyep
            var eyep = new Vec(a.p.x + e.max_range * Math.sin(a.angle + e.angle),
                               a.p.y + e.max_range * Math.cos(a.angle + e.angle));
            var res = this.stuff_collide_(a.p, eyep, true, true);
            if(res) {
              // eye collided with wall
              e.sensed_proximity = res.up.dist_from(a.p);
              e.sensed_type = res.type;
            } else {
              e.sensed_proximity = e.max_range;
              e.sensed_type = -1;
            }
          }

          // Reset nostril sensors
          resetSensors(a.sensors.nostrils);

          // x/y reversed compared to Gazebo.
          // Find nearest nostril and apply goal
          //`tan(rad) = Opposite / Adjacent = (y2-y1)/(x2-x1)`
          var srad = Math.atan2(this.goals[i].p.x - a.p.x, this.goals[i].p.y - a.p.y);
          //`Hypotenuse = (y2-y1)/sin(rad)`
          var sdis = Math.abs((this.goals[i].p.x - a.p.x)/Math.sin(srad));

          var robot_r = a.angle;
          if (robot_r > Math.PI) {
             robot_r -= 2 * Math.PI;
          } else if (robot_r < -Math.PI) {
             robot_r += 2 * Math.PI;
          }

          // Minus robot pose from goal direction.
          srad -= robot_r;
          if (srad > Math.PI) {
           srad -= 2 * Math.PI;
          } else if (srad < -Math.PI) {
           srad += 2 * Math.PI;
          }
          //console.log(robot_r.toFixed(3), srad.toFixed(3), sdis.toFixed(0));

          var e = findByAngle(a.sensors.nostrils, srad);
          if (e && sdis < e.max_range) {
           // eye collided with wall
           e.sensed_proximity = sdis;
           e.sensed_type = this.goals[i].type;
          }

          // Record for rewarding later.
          a.addGoal(0, sdis, srad);
        }

        // let the agents behave in the world based on their input
        for(i=0,n=this.agents.length;i<n;i++) {
          this.agents[i].forward();
        }

        // apply outputs of agents on evironment
        for(i=0,n=this.agents.length;i<n;i++) {
          a = this.agents[i];
          a.op = a.p; // back up old position
          a.oangle = a.angle; // and angle

          // steer the agent according to outputs of wheel velocities
          var v = new Vec(0, a.rad / 2.0);
          v = v.rotate(a.angle + Math.PI/2);
          var w1p = a.p.add(v); // positions of wheel 1 and 2
          var w2p = a.p.sub(v);
          var vv = a.p.sub(w2p);
          vv = vv.rotate(-a.rot1);
          var vv2 = a.p.sub(w1p);
          vv2 = vv2.rotate(a.rot2);
          var np = w2p.add(vv);
          np.scale(0.5);
          var np2 = w1p.add(vv2);
          np2.scale(0.5);
          a.p = np.add(np2);

          a.angle -= a.rot1;
          if(a.angle<0)a.angle+=2*Math.PI;
          a.angle += a.rot2;
          if(a.angle>2*Math.PI)a.angle-=2*Math.PI;

          // agent is trying to move from p to op. Check walls
          var res = this.stuff_collide_(a.op, a.p, true, false);
          if(res) {
            // wall collision! reset position
            a.p = a.op;
          }

          // handle boundary conditions
          if(a.p.x<0)a.p.x=0;
          if(a.p.x>this.W)a.p.x=this.W;
          if(a.p.y<0)a.p.y=0;
          if(a.p.y>this.H)a.p.y=this.H;
        }

        // tick all items
        var update_items = false;
        for(i=0,n=this.items.length;i<n;i++) {
          it = this.items[i];
          it.age += 1;

          // see if some agent gets lunch
          for(var j=0,m=this.agents.length;j<m;j++) {
            a = this.agents[j];
            var d = a.p.dist_from(it.p);
            if(d < it.rad + a.rad) {

              // wait lets just make sure that this isn't through a wall
              var rescheck = this.stuff_collide_(a.p, it.p, true, false);
              if(!rescheck) {
                // ding! nom nom nom
                if(it.type === 1) a.digestion_signal += 5.0; // mmm delicious apple
                if(it.type === 2) a.digestion_signal += -6.0; // ewww poison
                it.cleanup_ = true;
                update_items = true;
                break; // break out of loop, item was consumed
              }
            }
          }

          if(it.age > 5000 && this.clock % 100 === 0 && convnetjs.randf(0,1)<0.1) {
            it.cleanup_ = true; // replace this one, has been around too long
            update_items = true;
          }
        }
        if(update_items) {
          var nt = [];
          for(i=0,n=this.items.length;i<n;i++) {
            it = this.items[i];
            if(!it.cleanup_) nt.push(it);
          }
          this.items = nt; // swap
        }
        /*
        if(this.items.length < 30 && this.clock % 10 === 0 && convnetjs.randf(0,1)<0.25) {
          var newitx = convnetjs.randf(20, this.W-20);
          var newity = convnetjs.randf(20, this.H-20);
          var newitt = convnetjs.randi(1, 3); // food or poison (1 and 2)
          var newit = new Item(newitx, newity, newitt);
          this.items.push(newit);
        }
        */

        if (this.clock % 500 === 0 && convnetjs.randf(0,1)<0.25) {
          // Re-init goals
          for(i=0,n=this.agents.length;i<n;i++) {
            this.goals[i] = new Item(
                convnetjs.randf(20, this.W-20),
                convnetjs.randf(20, this.H-20),
                0
            );
            this.goals[i].rad = 15;
          }
        }

        // agents are given the opportunity to learn based on feedback of their action on environment
        for(i=0,n=this.agents.length;i<n;i++) {
          this.agents[i].backward();
        }
      }
    }

    /**
     * Lookup a sensor array by name.
     * @function
     * @param {array} arr
     * @param {string} name
     * @return {mixed}
     */
    var findByName = function(arr, name) {
      for (var i=0; i<arr.length; i++) {
        if (arr[i].name === name) {
          return arr[i];
        }
      }
      return;
    };

    /**
     * Lookup a sensor array by view direction.
     * @function
     * @param {array} arr
     * @param {float} rad
     * @return {mixed}
     */
    var findByAngle = function(arr, rad) {
      for (var i=0; i<arr.length; i++) {
        // FIXME: `=` missing exact gap between, grabbing it from one side, half it?
        if (rad > arr[i].angle - (arr[i].fov/2) && rad <= arr[i].angle + (arr[i].fov/2)) {
          return arr[i];
        }
      }
      return;
    };

    /**
     * Lookup a sensor array by view direction.
     * @function
     * @param {array} arr
     */
    var resetSensors = function(arr) {
      for (var i=0; i<arr.length; i++) {
        arr[i].sensed_proximity = arr[i].max_range;
        arr[i].sensed_type = -1;
        arr[i].updated = true;
      }
    };

    /**
     * Sensor sensor has a maximum range and senses walls
     * @class
     * @constructor {object} input
     */
    var Sensor = function(input) {
      console.log('Creating sensor', input.name);
      this.name             = (input && input.name)?      input.name:'';
      this.angle            = (input && input.angle)?     input.angle:0;
      this.fov              = (input && input.fov)?       input.fov:(15*Math.PI/180); // Default 15deg.
      this.max_range        = (input && input.max_range)? input.max_range:4;
      this.max_type         = (input && input.max_type)?  input.max_type:1;
      this.sensed_proximity = this.max_range;
      this.sensed_type      = -1; // what does the eye see?

      // Watch for updates, syncing framerate to sensors.
      this.updated = false;
    };


    // RatSLAM Goal log for rewarding distance.
    var Goal = function(id, dis, rad) {
      //console.log('Creating goal', id, dis, rad);
      this.id  = id;
      this.dis = dis;
      this.rad = rad;
    };

    /**
     * Initialise sensor positions.
     * @function
     * @return {object}
     */
    var initSensors = function() {
      var res = {};
      for (var j in config.sensors) {
        if (config.sensors.hasOwnProperty(j)) {
          var fov   = config.sensors[j].fov;
          var types = config.sensors[j].types;
          var range = config.sensors[j].range;
          for (var i=0; i<config.sensors[j].names.length; i++) {
            var rad = (i-((config.sensors[j].names.length-1)/2))*fov;
            if (typeof(res[j]) === 'undefined') res[j] = [];
            res[j].push({
              name:      config.sensors[j].names[i],
              angle:     rad,
              fov:       fov,
              max_range: range,
              max_type:  config.sensors[j].types
            });
          }
        }
      }
      console.log(res);
      return res;
    };

    // A single agent
    var Agent = function(behavior, colour, sensors, actions) {
      var i,j;

      // positional information
      this.p = new Vec(50, 50);
      this.op = this.p; // old position
      this.angle = 0; // direction facing

      this.rad = 10;


      // TODO: Validate given configs and throw errors.

      this.repeat_cnt = 0;

      // Initialise sensors from config passed in.
      var num_inputs = 0;
      this.sensors = {};
      for (j in sensors) {
       if (sensors.hasOwnProperty(j)) {
         for (i=0; i<sensors[j].length; i++) {
           if (typeof(sensors[j][i].angle) !== 'undefined' && typeof(sensors[j][i].fov) !== 'undefined') {
             if (typeof(this.sensors[j]) === 'undefined') this.sensors[j] = [];
             this.sensors[j].push(new Sensor(sensors[j][i]));
             num_inputs += sensors[j][i].max_type;
           }
         }
       }
      }

      this.actions = (actions)?actions:[
       // Default actions.
       [1.0,0.0],
       [1.0,-3.0],
       [1.0,3.0],
       [0.0,-4.0],
       [0.0,4.0]
      ];

      // Remember RatSLAM goals for rewarding distance.
      this.goal = {};

      //this.brain = new deepqlearn.Brain(this.eyes.length * 3, this.actions.length);
      var spec;
      if(behavior == 'greedy') {
        spec = document.getElementById('qspec_greedy').value;
      } else if(behavior == 'thompson') {
        spec = document.getElementById('qspec_thompson').value;
      }
      eval(spec);
      this.brain = brain;
      this.colour = colour;

      this.reward_bonus = 0.0;
      this.digestion_signal = 0.0;

      // outputs on world
      this.rot1 = 0.0; // rotation speed of 1st wheel
      this.rot2 = 0.0; // rotation speed of 2nd wheel

      this.prevactionix = -1;
    }
    Agent.prototype = {
      /**
       * Add RatSLAM goal to memory for later reward
       * @method addGoal
       * @param {integer} id
       * @param {float} dis
       * @param {float} rad
       */
      addGoal: function(id, dis, rad) {
        // TODO: If Goal ID has changed, publish an "eat" reward?
        // Does it only change when eaten? Not really, it changes when shortcut too.
        this.goal = new Goal(id, dis, rad);
      },
      forward: function() {
        // in forward pass the agent simply behaves in the environment
        // create input to brain
        var i,j;
        var idx = 0;
        var num_inputs = 0;
        for (j in this.sensors) {
          if (this.sensors.hasOwnProperty(j)) {
            num_inputs += this.sensors[j].length;
          }
        }
        var input_array = new Array(num_inputs * 1);

        var idx_last = 0;
        for (j in this.sensors) {
          if (this.sensors.hasOwnProperty(j)) {
            for (i=0; i<this.sensors[j].length; i++) {
              var s = this.sensors[j][i];
              idx = (i * s.max_type)+idx_last;
              for (k=0; k<s.max_type; k++) {
                input_array[idx+k] = 1.0;
              }
              if (s.sensed_type !== -1) {
                input_array[idx+s.sensed_type] = s.sensed_proximity/s.max_range; // normalize to [0,1]
              }
            }
            // Offset the next sensor group by this much.
            idx_last += this.sensors[j].length * this.sensors[j][0].max_type;
          }
        }

        // get action from brain
        var actionix = this.brain.forward(input_array);
        var action = this.actions[actionix];
        this.actionix = actionix; //back this up

        // demultiplex into behavior variables
        this.rot1 = action[0]*1;
        this.rot2 = action[1]*1;

        //this.rot1 = 0;
        //this.rot2 = 0;
      },
      backward: function() {
        // in backward pass agent learns.
        // compute reward
        var proximity_reward = 0.0;
        var num_eyes = this.sensors.eyes.length;
        for (var i=0; i<num_eyes; i++) {
         var e = this.sensors.eyes[i];
         // agents dont like to see walls, especially up close
         var prox_sensed = e.sensed_proximity;
         // Move walls away a little when close to goal.
         if (this.goal && this.goal.dis > 0 && this.goal.dis < prox_sensed && prox_sensed < e.max_range) {
             prox_sensed += this.goal.dis;
         }
         proximity_reward += e.sensed_type === 0 ? prox_sensed/e.max_range : 1.0;

        }
        proximity_reward = 1 * proximity_reward/num_eyes;

        // agents like to be near goals
        var goal_dis_factor = 0.0;
        var goal_rad_factor = 0.0;
        var goal_reward     = 0.0;
        if (this.goal && this.goal.dis > 0 && this.goal.dis < this.sensors.nostrils[0].max_range) {
           // Inversely proportional to distance.
           goal_dis_factor = 1 - (1 / (this.sensors.nostrils[0].max_range / this.goal.dis));
           // Proportional to the closeness to centre of view.
           //goal_rad_factor = jStat.normal.pdf(this.goal.rad, 0, 90*Math.PI/180);
           //goal_rad_factor = 0.0;

           //goal_reward = 1 * goal_dis_factor * goal_rad_factor * Math.pow(proximity_reward, 2);
           //goal_reward = 1 * goal_dis_factor * goal_rad_factor;
           /*
           console.log(
               'goal_reward',
               ' =:'+goal_reward.toFixed(5),
               ' p:'+proximity_reward.toFixed(3),
               ' r:'+goal_dis_factor.toFixed(3),
               (this.sensors.nostrils[0].max_range / this.goal.dis).toFixed(3),
               ' c:'+goal_rad_factor.toFixed(3)
           );
           */
        }
        goal_dis_factor = Math.max(0.01, goal_dis_factor);
        goal_reward = 1 * goal_dis_factor; // remove polynomials
        //goal_reward = 1 * Math.pow(goal_dis_factor, 2);
        //goal_reward = 1 * goal_dis_factor * proximity_reward;
        //goal_reward = 0.2 * Math.pow(goal_dis_factor * proximity_reward, 2);
        //goal_reward = 0.1 * Math.pow(goal_dis_factor * proximity_reward, 2);
        //goal_reward = 1 * goal_dis_factor;
        // Mix goal reward straight into proximity.
        //proximity_reward *= Math.pow(goal_dis_factor, 2);

        // agents like to go straight forward, more-so towards goals. // FIXME: "near" goals... side-effect, max towards goal.
        var forward_reward = 0.0;
        // Deprecated, bugs with thompson sampling and goal gives forward incentive.
        // FIXME: but rats run on treadmills.....

        // TODO: Refactor to overloadable functions like `random_action`.
        //if (this.actionix === 0 || this.actionix === 1 || this.actionix === 2) {
        if (this.actionix === 0) {
          // Some forward reward, some forward goal reward.
          // Instead of proximity threshold, a lower limit of 0.2.
          // TODO: by goal_reward also?
          forward_reward = 0.1 * proximity_reward;
          //forward_reward = 0.1 * goal_reward;
          //forward_reward = 0.1 * goal_reward * proximity_reward; // remove polynomials
          //forward_reward = 0.1 * proximity_reward; // remove polynomials
          //forward_reward = 0.1 * Math.pow(proximity_reward, 2);
          //forward_reward = 0.1 * Math.pow((goal_reward * proximity_reward), 2);
          //forward_reward = 0.1 * Math.pow(proximity_reward, 2);
          //forward_reward = 0.1 * Math.pow(goal_reward, 2);
          //forward_reward = 0.1 * Math.pow((1 - goal_dis_factor) * proximity_reward, 2);
          //forward_reward = 0.1 * Math.pow(proximity_reward, 2);
          //forward_reward = 0.1 * Math.pow((goal_reward * proximity_reward), 2);
          //forward_reward = 0.1 * goal_dis_factor * goal_rad_factor * Math.pow(proximity_reward, 2);
          //forward_reward = 0.1 * Math.pow((proximity_reward/2) + (goal_reward/2), 2);
          //forward_reward = 0.1 * Math.pow(proximity_reward - goal_reward, 2); // Closer to wall more forward reward? Close to goal less?
          // Half as much for forward turns.
          /*
          // dropout likes walls
          if (this.actionix === 1 || this.actionix === 2) {
            forward_reward = forward_reward / 2;
          }
          */
        }

        // agents like to eat good things
        var digestion_reward = this.digestion_signal;
        this.digestion_signal = 0.0;

        //var reward = (proximity_reward/2) + forward_reward + (goal_reward/2) + digestion_reward;
        //var reward = proximity_reward + forward_reward + digestion_reward;
        //var reward = (((2*goal_reward) + proximity_reward)/3) + forward_reward + digestion_reward;
        //var reward = (goal_reward * proximity_reward) + forward_reward + digestion_reward;
        //var reward = proximity_reward + goal_reward + forward_reward + digestion_reward;
        //var reward = goal_reward + forward_reward + digestion_reward;
        //var reward = goal_reward + digestion_reward;
        //var reward = (goal_reward * (proximity_reward + forward_reward)) + digestion_reward; // dropout likes walls
        //var reward = (goal_reward * proximity_reward) + forward_reward + digestion_reward;
        //var reward = goal_reward;
        var reward = goal_reward + forward_reward;

        // Log repeating actions.
        // FIXME: Age stops increasing when not learning, spams log.
        if (this.brain.age % 50 === 0) {
         console.log(
           ' p:'+this.brain.behavior_policy[0],
           ' a:'+this.actionix,
           //'/'+this.repeat_cnt,
           ' =:'+reward.toFixed(5),
           ' p:'+proximity_reward.toFixed(3),
           ' f:'+forward_reward.toFixed(3),
           ' g:'+goal_reward.toFixed(3),
           ' d:'+digestion_reward.toFixed(3)
         );
        }

        // pass to brain for learning
        this.brain.backward(reward);

        if (this.goal && this.goal.dis < 0.05*this.sensors.nostrils[0].max_range) {
          console.log('Goal reached.', this.goal.dis.toFixed(3));
          // TODO: Just a little change from current position...

          // Re-init goal
          for(i=0,n=w.agents.length;i<n;i++) {
            // Find matching goal index.
            if (w.agents[i] === this) {
              w.goals[i] = new Item(
                  convnetjs.randf(20, w.W-20),
                  convnetjs.randf(20, w.H-20),
                  0
              );
              w.goals[i].rad = 15;
            }
          }

        }

      }
    };

    function draw_stats() {
      if(w.clock % 500 === 0) {
        var yl = Array(2);
        var yh = Array(2);
        for(var i=0; i<2; i++){
          var a = w.agents[i];
          var b = a.brain;
          yl[i] = b.average_reward_window.get_average();
          yh[i] = b.average_loss_window.get_average();
        }
        reward_graph.add(w.clock/500, yl);
        if (w.clock > 5000) loss_graph.add(w.clock/500, yh);
        var reward_canvas = document.getElementById("reward_canvas");
        var loss_canvas   = document.getElementById("loss_canvas");
        reward_graph.drawSelf(reward_canvas);
        loss_graph.drawSelf(loss_canvas);
      }
    }

    // Draw everything
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 1;
      var agents = w.agents;

      // draw walls in environment
      ctx.strokeStyle = "rgb(0,0,0)";
      ctx.beginPath();
      for(var i=0,n=w.walls.length;i<n;i++) {
        var q = w.walls[i];
        ctx.moveTo(q.p1.x, q.p1.y);
        ctx.lineTo(q.p2.x, q.p2.y);
      }
      ctx.stroke();

      // draw agents
      for(var i=0,n=agents.length;i<n;i++) {
        var a = agents[i];
        //var r = Math.floor(a.brain.latest_reward * 200);
        //if(r>255)r=255;if(r<0)r=0;
        //ctx.fillStyle = "rgb(" + r + ", 150, 150)";
        ctx.fillStyle = a.colour;
        ctx.strokeStyle = "rgb(0,0,0)";

        // draw agents body
        ctx.beginPath();
        ctx.arc(a.op.x, a.op.y, a.rad, 0, Math.PI*2, true);
        ctx.fill();
        ctx.stroke();

        // draw agents sight
        for(var ei=0,ne=a.sensors.eyes.length;ei<ne;ei++) {
          var e = a.sensors.eyes[ei];
          var sr = e.sensed_proximity;
          if(e.sensed_type === -1 || e.sensed_type === 0) {
            ctx.strokeStyle = "rgb(0,0,0)"; // wall or nothing
          }
          if(e.sensed_type === 1) { ctx.strokeStyle = "rgb(255,150,150)"; } // apples
          if(e.sensed_type === 2) { ctx.strokeStyle = "rgb(150,255,150)"; } // poison
          ctx.beginPath();
          ctx.moveTo(a.op.x, a.op.y);
          ctx.lineTo(a.op.x + sr * Math.sin(a.oangle + e.angle),
                     a.op.y + sr * Math.cos(a.oangle + e.angle));
          ctx.stroke();
        }

        // draw goal
        ctx.fillStyle = "rgb(150, 150, 150)";
        ctx.strokeStyle = "rgb(150,150,150)";
        var g = w.goals[i];
        if(g.type === 1) ctx.fillStyle = "rgb(255, 150, 150)";
        if(g.type === 2) ctx.fillStyle = "rgb(150, 255, 150)";
        ctx.beginPath();
        ctx.arc(g.p.x, g.p.y, g.rad, 0, Math.PI*2, true);
        ctx.fill();
        ctx.stroke();

        // draw agents smell
        for(var ei=0,ne=a.sensors.nostrils.length;ei<ne;ei++) {
          var e = a.sensors.nostrils[ei];
          var sr = e.sensed_proximity;
          if(e.sensed_type === -1) {
            ctx.strokeStyle = "rgb(230,230,230)";
          } else if (e.sensed_type === 0) {
            ctx.strokeStyle = "rgb(255,150,150)";
          }
          ctx.beginPath();
          ctx.moveTo(a.op.x, a.op.y);
          ctx.lineTo(a.op.x + sr * Math.sin(a.oangle + e.angle),
                     a.op.y + sr * Math.cos(a.oangle + e.angle));
          ctx.stroke();
        }
      }

      // draw items
      ctx.strokeStyle = "rgb(0,0,0)";
      for(var i=0,n=w.items.length;i<n;i++) {
        var it = w.items[i];
        if(it.type === 1) ctx.fillStyle = "rgb(255, 150, 150)";
        if(it.type === 2) ctx.fillStyle = "rgb(255, 255, 0)";
        ctx.beginPath();
        ctx.arc(it.p.x, it.p.y, it.rad, 0, Math.PI*2, true);
        ctx.fill();
        ctx.stroke();
      }

      //w.agents[1].brain.visSelf(document.getElementById('brain_info_div'));
    }

    // Tick the world
    function tick() {
      w.tick();
      if(!skipdraw || w.clock % 500 === 0) {
        draw();
        draw_stats();
      }
    }

    var simspeed = 2;
    function goveryfast() {
      window.clearInterval(current_interval_id);
      current_interval_id = setInterval(tick, 0);
      skipdraw = true;
      simspeed = 3;
    }
    function gofast() {
      window.clearInterval(current_interval_id);
      current_interval_id = setInterval(tick, 0);
      skipdraw = false;
      simspeed = 2;
    }
    function gonormal() {
      window.clearInterval(current_interval_id);
      current_interval_id = setInterval(tick, 30);
      skipdraw = false;
      simspeed = 1;
    }
    function goslow() {
      window.clearInterval(current_interval_id);
      current_interval_id = setInterval(tick, 200);
      skipdraw = false;
      simspeed = 0;
    }

    function savenet() {
      var j = w.agents[0].brain.value_net.toJSON();
      var t = JSON.stringify(j);
      document.getElementById('tt').value = t;
    }

    function loadnet() {
      var t = document.getElementById('tt').value;
      var j = JSON.parse(t);
      w.agents[0].brain.value_net.fromJSON(j);
      stoplearn(); // also stop learning
      gonormal();
    }

    function startlearn() {
      w.agents[0].brain.learning = true;
    }
    function stoplearn() {
      w.agents[0].brain.learning = false;
    }

    function reload() {
      w.agents = [new Agent()]; // this should simply work. I think... ;\
      reward_graph = cnnvis.MultiGraph(['thompson', 'greedy'], {styles: ['rgb(0,0,255)', 'rgb(0,255,0)']}); // reinit
      loss_graph   = cnnvis.MultiGraph(['thompson', 'greedy'], {styles: ['rgb(0,0,255)', 'rgb(0,255,0)']}); // reinit
    }

    var w; // global world object
    var reward_graph, loss_graph;
    var current_interval_id;
    var skipdraw = false;
    function start() {
      canvas = document.getElementById("canvas");
      ctx = canvas.getContext("2d");

      w = new World();
      w.agents = [
        new Agent(
          'thompson', 'rgb(0,0,255)',
          initSensors(),
          config.actions,
          config.brain_opts
        ),
        new Agent(
          'greedy', 'rgb(0,255,0)',
          initSensors(),
          config.actions,
          config.brain_opts
        )
      ];

      // Init goals
      for(var i=0,n=w.agents.length;i<n;i++) {
        w.goals[i] = new Item(
            convnetjs.randf(20, w.W-20),
            convnetjs.randf(20, w.H-20),
            0
        );
        w.goals[i].rad = 15;
      }

      reward_graph = new cnnvis.MultiGraph(['Thompson', 'Greedy'], {styles: ['rgb(0,0,255)', 'rgb(0,255,0)']});
      loss_graph   = new cnnvis.MultiGraph(['Thompson', 'Greedy'], {styles: ['rgb(0,0,255)', 'rgb(0,255,0)']});

      gofast();
    }
    function stop() {
      window.clearInterval(current_interval_id);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var reward_canvas = document.getElementById("reward_canvas");
      reward_canvas.getContext("2d").clearRect(0, 0, reward_canvas.width, reward_canvas.height);
      var loss_canvas = document.getElementById("loss_canvas");
      loss_canvas.getContext("2d").clearRect(0, 0, loss_canvas.width, loss_canvas.height);
    }

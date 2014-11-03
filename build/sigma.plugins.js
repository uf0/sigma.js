;(function(undefined) {
  'use strict';

  if (typeof sigma === 'undefined')
    throw 'sigma is not declared';

  // Initialize package:
  sigma.utils.pkg('sigma.parsers');

  // Just a basic ID generator:
  var _id = 0;
  function edgeId() {
    return 'e' + (_id++);
  }

  /**
   * If the first arguments is a valid URL, this function loads a GEXF file and
   * creates a new sigma instance or updates the graph of a given instance. It
   * is possible to give a callback that will be executed at the end of the
   * process. And if the first argument is a DOM element, it will skip the
   * loading step and parse the given XML tree to fill the graph.
   *
   * @param  {string|DOMElement} target   The URL of the GEXF file or a valid
   *                                      GEXF tree.
   * @param  {object|sigma}      sig      A sigma configuration object or a
   *                                      sigma instance.
   * @param  {?function}         callback Eventually a callback to execute
   *                                      after having parsed the file. It will
   *                                      be called with the related sigma
   *                                      instance as parameter.
   */
  sigma.parsers.gexf = function(target, sig, callback) {
    var i,
        l,
        arr,
        obj;

    function parse(graph) {
      // Adapt the graph:
      arr = graph.nodes;
      for (i = 0, l = arr.length; i < l; i++) {
        obj = arr[i];

        obj.id = obj.id;
        if (obj.viz && typeof obj.viz === 'object') {
          if (obj.viz.position && typeof obj.viz.position === 'object') {
            obj.x = obj.viz.position.x;
            obj.y = -obj.viz.position.y; // Needed otherwise it's up side down
          }
          obj.size = obj.viz.size;
          obj.color = obj.viz.color;
        }
      }

      arr = graph.edges;
      for (i = 0, l = arr.length; i < l; i++) {
        obj = arr[i];

        obj.id = typeof obj.id === 'string' ? obj.id : edgeId();
        obj.source = '' + obj.source;
        obj.target = '' + obj.target;

        if (obj.viz && typeof obj.viz === 'object') {
          obj.color = obj.viz.color;
          obj.size = obj.viz.thickness;
        }

        // Weight over viz.thickness?
        obj.size = obj.weight;
      }

      // Update the instance's graph:
      if (sig instanceof sigma) {
        sig.graph.clear();

        arr = graph.nodes;
        for (i = 0, l = arr.length; i < l; i++)
          sig.graph.addNode(arr[i]);

        arr = graph.edges;
        for (i = 0, l = arr.length; i < l; i++)
          sig.graph.addEdge(arr[i]);

      // ...or instantiate sigma if needed:
      } else if (typeof sig === 'object') {
        sig.graph = graph;
        sig = new sigma(sig);

      // ...or it's finally the callback:
      } else if (typeof sig === 'function') {
        callback = sig;
        sig = null;
      }

      // Call the callback if specified:
      if (callback) {
        callback(sig || graph);
        return;
      } else
        return graph;
    }

    if (typeof target === 'string')
      gexf.fetch(target, parse);
    else if (typeof target === 'object')
      return parse(gexf.parse(target));
  };
}).call(this);

;(function(undefined) {
  'use strict';

  if (typeof sigma === 'undefined')
    throw 'sigma is not declared';

  // Initialize package:
  sigma.utils.pkg('sigma.parsers');
  sigma.utils.pkg('sigma.utils');

  /**
   * Just an XmlHttpRequest polyfill for different IE versions.
   *
   * @return {*} The XHR like object.
   */
  sigma.utils.xhr = function() {
    if (window.XMLHttpRequest)
      return new XMLHttpRequest();

    var names,
        i;

    if (window.ActiveXObject) {
      names = [
        'Msxml2.XMLHTTP.6.0',
        'Msxml2.XMLHTTP.3.0',
        'Msxml2.XMLHTTP',
        'Microsoft.XMLHTTP'
      ];

      for (i in names)
        try {
          return new ActiveXObject(names[i]);
        } catch (e) {}
    }

    return null;
  };

  /**
   * This function loads a JSON file and creates a new sigma instance or
   * updates the graph of a given instance. It is possible to give a callback
   * that will be executed at the end of the process.
   *
   * @param  {string}       url      The URL of the JSON file.
   * @param  {object|sigma} sig      A sigma configuration object or a sigma
   *                                 instance.
   * @param  {?function}    callback Eventually a callback to execute after
   *                                 having parsed the file. It will be called
   *                                 with the related sigma instance as
   *                                 parameter.
   */
  sigma.parsers.json = function(url, sig, callback) {
    var graph,
        xhr = sigma.utils.xhr();

    if (!xhr)
      throw 'XMLHttpRequest not supported, cannot load the file.';

    xhr.open('GET', url, true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        graph = JSON.parse(xhr.responseText);

        // Update the instance's graph:
        if (sig instanceof sigma) {
          sig.graph.clear();
          sig.graph.read(graph);

        // ...or instantiate sigma if needed:
        } else if (typeof sig === 'object') {
          sig.graph = graph;
          sig = new sigma(sig);

        // ...or it's finally the callback:
        } else if (typeof sig === 'function') {
          callback = sig;
          sig = null;
        }

        // Call the callback if specified:
        if (callback)
          callback(sig || graph);
      }
    };
    xhr.send();
  };
}).call(this);

/**
 * This plugin provides a method to animate a sigma instance by interpolating
 * some node properties. Check the sigma.plugins.animate function doc or the
 * examples/animate.html code sample to know more.
 */
(function() {
  'use strict';

  if (typeof sigma === 'undefined')
    throw 'sigma is not declared';

  sigma.utils.pkg('sigma.plugins');

  var _id = 0,
      _cache = {};

  // TOOLING FUNCTIONS:
  // ******************
  function parseColor(val) {
    if (_cache[val])
      return _cache[val];

    var result = [0, 0, 0];

    if (val.match(/^#/)) {
      val = (val || '').replace(/^#/, '');
      result = (val.length === 3) ?
        [
          parseInt(val.charAt(0) + val.charAt(0), 16),
          parseInt(val.charAt(1) + val.charAt(1), 16),
          parseInt(val.charAt(2) + val.charAt(2), 16)
        ] :
        [
          parseInt(val.charAt(0) + val.charAt(1), 16),
          parseInt(val.charAt(2) + val.charAt(3), 16),
          parseInt(val.charAt(4) + val.charAt(5), 16)
        ];
    } else if (val.match(/^ *rgba? *\(/)) {
      val = val.match(
        /^ *rgba? *\( *([0-9]*) *, *([0-9]*) *, *([0-9]*) *(,.*)?\) *$/
      );
      result = [
        +val[1],
        +val[2],
        +val[3]
      ];
    }

    _cache[val] = {
      r: result[0],
      g: result[1],
      b: result[2]
    };

    return _cache[val];
  }

  function interpolateColors(c1, c2, p) {
    c1 = parseColor(c1);
    c2 = parseColor(c2);

    var c = {
      r: c1.r * (1 - p) + c2.r * p,
      g: c1.g * (1 - p) + c2.g * p,
      b: c1.b * (1 - p) + c2.b * p
    };

    return 'rgb(' + [c.r | 0, c.g | 0, c.b | 0].join(',') + ')';
  }

  /**
   * This function will animate some specified node properties. It will
   * basically call requestAnimationFrame, interpolate the values and call the
   * refresh method during a specified duration.
   *
   * Recognized parameters:
   * **********************
   * Here is the exhaustive list of every accepted parameters in the settings
   * object:
   *
   *   {?(function|string)} easing     Either the name of an easing in the
   *                                   sigma.utils.easings package or a
   *                                   function. If not specified, the
   *                                   quadraticInOut easing from this package
   *                                   will be used instead.
   *   {?number}            duration   The duration of the animation. If not
   *                                   specified, the "animationsTime" setting
   *                                   value of the sigma instance will be used
   *                                   instead.
   *   {?function}          onComplete Eventually a function to call when the
   *                                   animation is ended.
   *
   * @param  {sigma}   s       The related sigma instance.
   * @param  {object}  animate An hash with the keys being the node properties
   *                           to interpolate, and the values being the related
   *                           target values.
   * @param  {?object} options Eventually an object with options.
   */
  sigma.plugins.animate = function(s, animate, options) {
    var o = options || {},
        id = ++_id,
        duration = o.duration || s.settings('animationsTime'),
        easing = typeof o.easing === 'string' ?
          sigma.utils.easings[o.easing] :
          typeof o.easing === 'function' ?
          o.easing :
          sigma.utils.easings.quadraticInOut,
        start = sigma.utils.dateNow(),
        // Store initial positions:
        startPositions = s.graph.nodes().reduce(function(res, node) {
          var k;
          res[node.id] = {};
          for (k in animate)
            if (k in node)
              res[node.id][k] = node[k];
          return res;
        }, {});

    s.animations = s.animations || Object.create({});
    sigma.plugins.kill(s);

    // Do not refresh edgequadtree during drag:
    var k,
        c;
    for (k in s.cameras) {
      c = s.cameras[k];
      c.edgequadtree._enabled = false;
    }

    function step() {
      var p = (sigma.utils.dateNow() - start) / duration;

      if (p >= 1) {
        s.graph.nodes().forEach(function(node) {
          for (var k in animate)
            if (k in animate)
              node[k] = node[animate[k]];
        });

        // Allow to refresh edgequadtree:
        var k,
            c;
        for (k in s.cameras) {
          c = s.cameras[k];
          c.edgequadtree._enabled = true;
        }

        s.refresh();
        if (typeof o.onComplete === 'function')
          o.onComplete();
      } else {
        p = easing(p);
        s.graph.nodes().forEach(function(node) {
          for (var k in animate)
            if (k in animate) {
              if (k.match(/color$/))
                node[k] = interpolateColors(
                  startPositions[node.id][k],
                  node[animate[k]],
                  p
                );
              else
                node[k] =
                  node[animate[k]] * p +
                  startPositions[node.id][k] * (1 - p);
            }
        });

        s.refresh();
        s.animations[id] = requestAnimationFrame(step);
      }
    }

    step();
  };

  sigma.plugins.kill = function(s) {
    for (var k in (s.animations || {}))
      cancelAnimationFrame(s.animations[k]);

    // Allow to refresh edgequadtree:
    var k,
        c;
    for (k in s.cameras) {
      c = s.cameras[k];
      c.edgequadtree._enabled = true;
    }
  };
}).call(window);

/**
 * This plugin provides a method to drag & drop nodes. Check the
 * sigma.plugins.dragNodes function doc or the examples/basic.html &
 * examples/api-candy.html code samples to know more.
 */
(function() {
  'use strict';

  if (typeof sigma === 'undefined')
    throw 'sigma is not declared';

  sigma.utils.pkg('sigma.plugins');


  /**
   * This function will add `mousedown`, `mouseup` & `mousemove` events to the
   * nodes in the `overNode`event to perform drag & drop operations. It uses
   * `linear interpolation` [http://en.wikipedia.org/wiki/Linear_interpolation]
   * and `rotation matrix` [http://en.wikipedia.org/wiki/Rotation_matrix] to
   * calculate the X and Y coordinates from the `cam` or `renderer` node
   * attributes. These attributes represent the coordinates of the nodes in
   * the real container, not in canvas.
   *
   * Fired events:
   * *************
   * startdrag  Fired at the beginning of the drag.
   * drag       Fired while the node is dragged.
   * drop       Fired at the end of the drag if the node has been dragged.
   * dragend    Fired at the end of the drag.
   *
   * Recognized parameters:
   * **********************
   * @param  {sigma}    s        The related sigma instance.
   * @param  {renderer} renderer The related renderer instance.
   */
  function DragNodes(s, renderer) {
    sigma.classes.dispatcher.extend(this);

    // A quick hardcoded rule to prevent people from using this plugin with the
    // WebGL renderer (which is impossible at the moment):
    if (
      sigma.renderers.webgl &&
      renderer instanceof sigma.renderers.webgl
    )
      throw new Error(
        'The sigma.plugins.dragNodes is not compatible with the WebGL renderer'
      );

    // Init variables:
    var _self = this,
      _s = s,
      _body = document.body,
      _renderer = renderer,
      _mouse = renderer.container.lastChild,
      _camera = renderer.camera,
      _node = null,
      _prefix = '',
      _hoverStack = [],
      _hoverIndex = {},
      _isMouseDown = false,
      _isMouseOverCanvas = false,
      _drag = false;

    // It removes the initial substring ('read_') if it's a WegGL renderer.
    if (renderer instanceof sigma.renderers.webgl) {
      _prefix = renderer.options.prefix.substr(5);
    } else {
      _prefix = renderer.options.prefix;
    }

    renderer.bind('overNode', nodeMouseOver);
    renderer.bind('outNode', treatOutNode);
    renderer.bind('click', click);

    _s.bind('kill', function() {
      _self.unbindAll();
    });

    /**
     * Unbind all event listeners.
     */
    this.unbindAll = function() {
      _mouse.removeEventListener('mousedown', nodeMouseDown);
      _body.removeEventListener('mousemove', nodeMouseMove);
      _body.removeEventListener('mouseup', nodeMouseUp);
      _renderer.unbind('overNode', nodeMouseOver);
      _renderer.unbind('outNode', treatOutNode);
    }

    // Calculates the global offset of the given element more accurately than
    // element.offsetTop and element.offsetLeft.
    function calculateOffset(element) {
      var style = window.getComputedStyle(element);
      var getCssProperty = function(prop) {
        return parseInt(style.getPropertyValue(prop).replace('px', '')) || 0;
      };
      return {
        left: element.getBoundingClientRect().left + getCssProperty('padding-left'),
        top: element.getBoundingClientRect().top + getCssProperty('padding-top')
      };
    };

    function click(event) {
      // event triggered at the end of the click
      _isMouseDown = false;
      _body.removeEventListener('mousemove', nodeMouseMove);
      _body.removeEventListener('mouseup', nodeMouseUp);

      if (!_hoverStack.length) {
        _node = null;
      }
    };

    function nodeMouseOver(event) {
      // Don't treat the node if it is already registered
      if (_hoverIndex[event.data.node.id]) {
        return;
      }

      // Add node to array of current nodes over
      _hoverStack.push(event.data.node);
      _hoverIndex[event.data.node.id] = true;

      if(_hoverStack.length && ! _isMouseDown) {
        // Set the current node to be the last one in the array
        _node = _hoverStack[_hoverStack.length - 1];
        _mouse.addEventListener('mousedown', nodeMouseDown);
      }
    };

    function treatOutNode(event) {
      // Remove the node from the array
      var indexCheck = _hoverStack.map(function(e) { return e; }).indexOf(event.data.node);
      _hoverStack.splice(indexCheck, 1);
      delete _hoverIndex[event.data.node.id];

      if(_hoverStack.length && ! _isMouseDown) {
        // On out, set the current node to be the next stated in array
        _node = _hoverStack[_hoverStack.length - 1];
      } else {
        _mouse.removeEventListener('mousedown', nodeMouseDown);
      }
    };

    function nodeMouseDown(event) {
      _isMouseDown = true;
      var size = _s.graph.nodes().length;
      if (_node && size > 0) {
        _mouse.removeEventListener('mousedown', nodeMouseDown);
        _body.addEventListener('mousemove', nodeMouseMove);
        _body.addEventListener('mouseup', nodeMouseUp);

        // Do not refresh edgequadtree during drag:
        var k,
            c;
        for (k in _s.cameras) {
          c = _s.cameras[k];
          if (c.edgequadtree !== undefined) {
            c.edgequadtree._enabled = false;
          }
        }

        // Deactivate drag graph.
        _renderer.settings({mouseEnabled: false, enableHovering: false});
        _s.refresh();

        _self.dispatchEvent('startdrag', {
          node: _node,
          captor: event,
          renderer: _renderer
        });
      }
    };

    function nodeMouseUp(event) {
      _isMouseDown = false;
      _mouse.addEventListener('mousedown', nodeMouseDown);
      _body.removeEventListener('mousemove', nodeMouseMove);
      _body.removeEventListener('mouseup', nodeMouseUp);

      // Allow to refresh edgequadtree:
      var k,
          c;
      for (k in _s.cameras) {
        c = _s.cameras[k];
        if (c.edgequadtree !== undefined) {
          c.edgequadtree._enabled = true;
        }
      }

      // Activate drag graph.
      _renderer.settings({mouseEnabled: true, enableHovering: true});
      _s.refresh();

      if (_drag) {
        _self.dispatchEvent('drop', {
          node: _node,
          captor: event,
          renderer: _renderer
        });
      }
      _self.dispatchEvent('dragend', {
        node: _node,
        captor: event,
        renderer: _renderer
      });
      
      _drag = false;
      _node = null;
    };

    function nodeMouseMove(event) {
      if(navigator.userAgent.toLowerCase().indexOf('firefox') > -1) {
        clearTimeout(timeOut);
        var timeOut = setTimeout(executeNodeMouseMove, 0);
      } else {
        executeNodeMouseMove();
      }

      function executeNodeMouseMove() {
        var offset = calculateOffset(_renderer.container),
            x = event.clientX - offset.left,
            y = event.clientY - offset.top,
            cos = Math.cos(_camera.angle),
            sin = Math.sin(_camera.angle),
            nodes = _s.graph.nodes(),
            ref = [];

        // Getting and derotating the reference coordinates.
        for (var i = 0; i < 2; i++) {
          var n = nodes[i];
          var aux = {
            x: n.x * cos + n.y * sin,
            y: n.y * cos - n.x * sin,
            renX: n[_prefix + 'x'],
            renY: n[_prefix + 'y'],
          };
          ref.push(aux);
        }

        // Applying linear interpolation.
        x = ((x - ref[0].renX) / (ref[1].renX - ref[0].renX)) *
          (ref[1].x - ref[0].x) + ref[0].x;
        y = ((y - ref[0].renY) / (ref[1].renY - ref[0].renY)) *
          (ref[1].y - ref[0].y) + ref[0].y;

        // Rotating the coordinates.
        _node.x = x * cos - y * sin;
        _node.y = y * cos + x * sin;

        _s.refresh();

        _drag = true;
        _self.dispatchEvent('drag', {
          node: _node,
          captor: event,
          renderer: _renderer
        });
      }
    };
  };

  /**
   * Interface
   * ------------------
   *
   * > var dragNodesListener = sigma.plugins.dragNodes(s, s.renderers[0]);
   */
  var _instance = {};

  /**
   * @param  {sigma} s The related sigma instance.
   * @param  {renderer} renderer The related renderer instance.
   */
  sigma.plugins.dragNodes = function(s, renderer) {
    // Create object if undefined
    if (!_instance[s.id]) {
      _instance[s.id] = new DragNodes(s, renderer);
    }

    s.bind('kill', function() {
      sigma.plugins.killDragNodes(s);
    });

    return _instance[s.id];
  };

  /**
   * This method removes the event listeners and kills the dragNodes instance.
   *
   * @param  {sigma} s The related sigma instance.
   */
  sigma.plugins.killDragNodes = function(s) {
    if (_instance[s.id] instanceof DragNodes) {
      _instance[s.id].unbindAll();
      delete _instance[s.id];
    }
  };

}).call(window);

;(function(undefined) {
  'use strict';

  if (typeof sigma === 'undefined')
    throw 'sigma is not declared';

  // Initialize package:
  sigma.utils.pkg('sigma.plugins');

  // Add custom graph methods:
  /**
   * This methods returns an array of nodes that are adjacent to a node.
   *
   * @param  {string} id The node id.
   * @return {array}     The array of adjacent nodes.
   */
  if (!sigma.classes.graph.hasMethod('adjacentNodes'))
    sigma.classes.graph.addMethod('adjacentNodes', function(id) {
      if (typeof id !== 'string')
        throw 'adjacentNodes: the node id must be a string.';

      var target,
          nodes = [];
      for(target in this.allNeighborsIndex[id]) {
        nodes.push(this.nodesIndex[target]);
      }
      return nodes;
    });

  /**
   * This methods returns an array of edges that are adjacent to a node.
   *
   * @param  {string} id The node id.
   * @return {array}     The array of adjacent edges.
   */
  if (!sigma.classes.graph.hasMethod('adjacentEdges'))
    sigma.classes.graph.addMethod('adjacentEdges', function(id) {
      if (typeof id !== 'string')
        throw 'adjacentEdges: the node id must be a string.';

      var a = this.allNeighborsIndex[id],
          eid,
          target,
          edges = [];
      for(target in a) {
        for(eid in a[target]) {
          edges.push(a[target][eid]);
        }
      }
      return edges;
    });


  // fast deep copy function
  function deepCopy(o) {
    var copy = Object.create(null);
    for (var i in o) {
      if (typeof o[i] === "object" && o[i] !== null) {
        copy[i] = deepCopy(o[i]);
      }
      else if (typeof o[i] === "function" && o[i] !== null) {
        // clone function:
        eval(" copy[i] = " +  o[i].toString());
        //copy[i] = o[i].bind(_g);
      }

      else
        copy[i] = o[i];
    }
    return copy;
  };

  function cloneChain(chain) {
    // Clone the array of filters:
    var copy = chain.slice(0);
    for (var i = 0, len = copy.length; i < len; i++) {
      copy[i] = deepCopy(copy[i]);
      if (typeof copy[i].processor === "function")
        copy[i].processor = 'filter.processors.' + copy[i].processor.name;
    };
    return copy;
  }


  /**
   * Sigma Filter
   * =============================
   *
   * @author Sébastien Heymann <seb@linkurio.us> (Linkurious)
   * @version 0.1.1
   */


  /**
   * Library of processors
   * ------------------
   */

  var Processors = {};   // available predicate processors

   /**
    *
    * @param  {sigma.classes.graph} g The graph instance.
    * @param  {function} fn The predicate.
    */
  Processors.nodes = function nodes(g, fn) {
    var n = g.nodes(),
        ln = n.length,
        e = g.edges(),
        le = e.length;

    // hide node, or keep former value
    while(ln--)
      n[ln].hidden = !fn.call(g, n[ln]) || n[ln].hidden;

    while(le--)
      if (g.nodes(e[le].source).hidden || g.nodes(e[le].target).hidden)
        e[le].hidden = true;
  };

   /**
    *
    * @param  {sigma.classes.graph} g The graph instance.
    * @param  {function} fn The predicate.
    */
  Processors.edges = function edges(g, fn) {
    var e = g.edges(),
        le = e.length;

    // hide edge, or keep former value
    while(le--)
      e[le].hidden = !fn.call(g, e[le]) || e[le].hidden;
  };

   /**
    *
    * @param  {sigma.classes.graph} g The graph instance.
    * @param  {string} id The center node.
    */
  Processors.neighbors = function neighbors(g, id) {
    var n = g.nodes(),
        ln = n.length,
        e = g.edges(),
        le = e.length,
        neighbors = g.adjacentNodes(id),
        nn = neighbors.length,
        no = {};

    while(nn--)
      no[neighbors[nn].id] = true;

    while(ln--)
      if (n[ln].id !== id && !(n[ln].id in no))
        n[ln].hidden = true;

    while(le--)
      if (g.nodes(e[le].source).hidden || g.nodes(e[le].target).hidden)
        e[le].hidden = true;
  };



  /**
   * Filter Object
   * ------------------
   * @param  {sigma} s The related sigma instance.
   */
  function Filter(s) {
    var _self = this,
      _s = s,
      _g = s.graph,
      _chain = [], // chain of wrapped filters
      _keysIndex = Object.create(null);
    
    // Binding on kill to clear the references
    _s.bind('kill', function() {
      console.log('kill');
      _self.kill();
    });

    /**
     * This function adds a filter to the chain of filters.
     *
     * @param  {function} fn  The filter (i.e. predicate processor).
     * @param  {function} p   The predicate.
     * @param  {?string}  key The key to identify the filter.
     */
    function register(fn, p, key) {
      if (key != undefined && typeof key !== 'string')
        throw 'The filter key "'+ key.toString() +'" must be a string.';

      if (key != undefined && !key.length)
        throw 'The filter key must be a non-empty string.';

      if (typeof fn !== 'function')
        throw 'The predicate of key "'+ key +'" must be a function.';

      if ('undo' === key)
        throw '"undo" is a reserved key.';

      if (_keysIndex[key])
        throw 'The filter "' + key + '" already exists.';

      if (key)
        _keysIndex[key] = true;

      _chain.push({
        'key': key,
        'processor': fn,
        'predicate': p
      });
    };

    /**
     * This function removes a set of filters from the chain.
     *
     * @param {object} o The filter keys.
     */
    function unregister(o) {
      _chain = _chain.filter(function(a) {
        return !(a.key in o);
      });

      for(var key in o)
        delete _keysIndex[key];
    };

    /**
     * This method is used to filter the nodes. The method must be called with
     * the predicate, which is a function that takes a node as argument and
     * returns a boolean. It may take an identifier as argument to undo the
     * filter later. The method wraps the predicate into an anonymous function
     * that looks through each node in the graph. When executed, the anonymous
     * function hides the nodes that fail a truth test (predicate). The method
     * adds the anonymous function to the chain of filters. The filter is not
     * executed until the apply() method is called.
     *
     * > var filter = new sigma.plugins.filter(s);
     * > filter.nodesBy(function(n) {
     * >   return this.degree(n.id) > 0;
     * > }, 'degreeNotNull');
     *
     * @param  {function}             fn  The filter predicate.
     * @param  {?string}              key The key to identify the filter.
     * @return {sigma.plugins.filter}     Returns the instance.
     */
    this.nodesBy = function(fn, key) {
      // Wrap the predicate to be applied on the graph and add it to the chain.
      register(Processors.nodes, fn, key);

      return this;
    };

    /**
     * This method is used to filter the edges. The method must be called with
     * the predicate, which is a function that takes a node as argument and
     * returns a boolean. It may take an identifier as argument to undo the
     * filter later. The method wraps the predicate into an anonymous function
     * that looks through each edge in the graph. When executed, the anonymous
     * function hides the edges that fail a truth test (predicate). The method
     * adds the anonymous function to the chain of filters. The filter is not
     * executed until the apply() method is called.
     *
     * > var filter = new sigma.plugins.filter(s);
     * > filter.edgesBy(function(e) {
     * >   return e.size > 1;
     * > }, 'edgeSize');
     *
     * @param  {function}             fn  The filter predicate.
     * @param  {?string}              key The key to identify the filter.
     * @return {sigma.plugins.filter}     Returns the instance.
     */
    this.edgesBy = function(fn, key) {
      // Wrap the predicate to be applied on the graph and add it to the chain.
      register(Processors.edges, fn, key);

      return this;
    };

    /**
     * This method is used to filter the nodes which are not direct connections
     * of a given node. The method must be called with the node identifier. It
     * may take an identifier as argument to undo the filter later. The filter
     * is not executed until the apply() method is called.
     *
     * > var filter = new sigma.plugins.filter(s);
     * > filter.neighborsOf('n0');
     *
     * @param  {string}               id  The node id.
     * @param  {?string}              key The key to identify the filter.
     * @return {sigma.plugins.filter}     Returns the instance.
     */
    this.neighborsOf = function(id, key) {
      if (typeof id !== 'string')
        throw 'The node id "'+ id.toString() +'" must be a string.';
      if (!id.length)
        throw 'The node id must be a non-empty string.';

      // Wrap the predicate to be applied on the graph and add it to the chain.
      register(Processors.neighbors, id, key);

      return this;
    };

    /**
     * This method is used to execute the chain of filters and to refresh the
     * display.
     *
     * > var filter = new sigma.plugins.filter(s);
     * > filter
     * >   .nodesBy(function(n) {
     * >     return this.degree(n.id) > 0;
     * >   }, 'degreeNotNull')
     * >   .apply();
     *
     * @return {sigma.plugins.filter}      Returns the instance.
     */
    this.apply = function() {
      for (var i = 0, len = _chain.length; i < len; ++i) {
        _chain[i].processor(_g, _chain[i].predicate);
      };

      if (_chain[0] && 'undo' === _chain[0].key) {
        _chain.shift();
      }

      _s.refresh();

      return this;
    };

    /**
     * This method undoes one or several filters, depending on how it is called.
     *
     * To undo all filters, call "undo" without argument. To undo a specific
     * filter, call it with the key of the filter. To undo multiple filters, call
     * it with an array of keys or multiple arguments, and it will undo each
     * filter, in the same order. The undo is not executed until the apply()
     * method is called. For instance:
     *
     * > var filter = new sigma.plugins.filter(s);
     * > filter
     * >   .nodesBy(function(n) {
     * >     return this.degree(n.id) > 0;
     * >   }, 'degreeNotNull');
     * >   .edgesBy(function(e) {
     * >     return e.size > 1;
     * >   }, 'edgeSize')
     * >   .undo();
     *
     * Other examples:
     * > filter.undo();
     * > filter.undo('myfilter');
     * > filter.undo(['myfilter1', 'myfilter2']);
     * > filter.undo('myfilter1', 'myfilter2');
     *
     * @param  {?(string|array|*string))} v Eventually one key, an array of keys.
     * @return {sigma.plugins.filter}       Returns the instance.
     */
    this.undo = function(v) {
      var q = Object.create(null),
          la = arguments.length;

      // find removable filters
      if (la === 1) {
        if (Object.prototype.toString.call(v) === '[object Array]')
          for (var i = 0, len = v.length; i < len; i++)
            q[v[i]] = true;

        else // 1 filter key
          q[v] = true;

      } else if (la > 1) {
        for (var i = 0; i < la; i++)
          q[arguments[i]] = true;
      }
      else
        this.clear();

      unregister(q);

      function processor() {
        var n = _g.nodes(),
            ln = n.length,
            e = _g.edges(),
            le = e.length;

        while(ln--)
          n[ln].hidden = false;

        while(le--)
          e[le].hidden = false;
      };

      _chain.unshift({
        'key': 'undo',
        'processor': processor
      });

      return this;
    };

    /**
     * This method is used to empty the chain of filters.
     * Prefer the undo() method to reset filters.
     *
     * > var filter = new sigma.plugins.filter(s);
     * > filter.clear();
     *
     * @return {sigma.plugins.filter} Returns the instance.
     */
    this.clear = function() {
      _chain.length = 0; // clear the array
      _keysIndex = Object.create(null);
      return this;
    };

    this.kill = function() {
      this.clear();
      _g = null;
      _s = null;
      return this;
    }

    /**
     * This method clones the filter chain and return the copy.
     *
     * > var filter = new sigma.plugins.filter(s);
     * > var chain = filter.export();
     *
     * @return {object}   The cloned chain of filters.
     */
    this.export = function() {
      var c = cloneChain(_chain);
      return c;
    };

    /**
     * This method sets the chain of filters with the specified chain.
     *
     * > var filter = new sigma.plugins.filter(s);
     * > var chain = [
     * >   {
     * >     key: 'my-filter',
     * >     predicate: function(n) {...},
     * >     processor: 'filter.processors.nodes'
     * >   }, ...
     * > ];
     * > filter.import(chain);
     *
     * @param {array} chain The chain of filters.
     * @return {sigma.plugins.filter} Returns the instance.
     */
    this.import = function(chain) {
      if (chain === undefined)
        throw 'Wrong arguments.';

      if (Object.prototype.toString.call(chain) !== '[object Array]')
        throw 'The chain" must be an array.';

      var copy = cloneChain(chain);

      for (var i = 0, len = copy.length; i < len; i++) {
        if (copy[i].predicate === undefined || copy[i].processor === undefined)
          throw 'Wrong arguments.';

        if (copy[i].key != undefined && typeof copy[i].key !== 'string')
          throw 'The filter key "'+ copy[i].key.toString() +'" must be a string.';

        if (typeof copy[i].predicate !== 'function')
          throw 'The predicate of key "'+ copy[i].key +'" must be a function.';

        if (typeof copy[i].processor !== 'string')
          throw 'The processor of key "'+ copy[i].key +'" must be a string.';

        // Replace the processor name by the corresponding function:
        switch(copy[i].processor) {
          case 'filter.processors.nodes':
            copy[i].processor = Processors.nodes;
            break;
          case 'filter.processors.edges':
            copy[i].processor = Processors.edges;
            break;
          case 'filter.processors.neighbors':
            copy[i].processor = Processors.neighbors;
            break;
          default:
            throw 'Unknown processor ' + copy[i].processor;
        }
      };

      _chain = copy;

      return this;
    };

  };



  /**
   * Interface
   * ------------------
   *
   * > var filter = sigma.plugins.filter(s);
   */
  var _instance = {};

  /**
   * @param  {sigma} s The related sigma instance.
   */
  sigma.plugins.filter = function(s) {
    // Create filter if undefined
    if (!_instance[s.id]) {
      _instance[s.id] = new Filter(s);
    }
    return _instance[s.id];
  };

  /**
   *  This function kills the filter instance.
   */
  sigma.plugins.killFilter = function() {
    if (_instance instanceof Filter) {
      _instance.undo().apply();
      _instance.clear();
    }
    _instance = {};
  };

}).call(this);
/**
 * This plugin provides a method to retrieve the neighborhood of a node.
 * Basically, it loads a graph and stores it in a headless sigma.classes.graph
 * instance, that you can query to retrieve neighborhoods.
 *
 * It is useful for people who want to provide a neighborhoods navigation
 * inside a big graph instead of just displaying it, and without having to
 * deploy an API or the list of every neighborhoods.
 *
 * This plugin also adds to the graph model a method called "neighborhood".
 * Check the code for more information.
 *
 * Here is how to use it:
 *
 *  > var db = new sigma.plugins.neighborhoods();
 *  > db.load('path/to/my/graph.json', function() {
 *  >   var nodeId = 'anyNodeID';
 *  >   mySigmaInstance
 *  >     .read(db.neighborhood(nodeId))
 *  >     .refresh();
 *  > });
 */
(function() {
  'use strict';

  if (typeof sigma === 'undefined')
    throw 'sigma is not declared';

  /**
   * This method takes the ID of node as argument and returns the graph of the
   * specified node, with every other nodes that are connected to it and every
   * edges that connect two of the previously cited nodes. It uses the built-in
   * indexes from sigma's graph model to search in the graph.
   *
   * @param  {string} centerId The ID of the center node.
   * @return {object}          The graph, as a simple descriptive object, in
   *                           the format required by the "read" graph method.
   */
  sigma.classes.graph.addMethod(
    'neighborhood',
    function(centerId) {
      var k1,
          k2,
          k3,
          node,
          center,
          // Those two local indexes are here just to avoid duplicates:
          localNodesIndex = {},
          localEdgesIndex = {},
          // And here is the resulted graph, empty at the moment:
          graph = {
            nodes: [],
            edges: []
          };

      // Check that the exists:
      if (!this.nodes(centerId))
        return graph;

      // Add center. It has to be cloned to add it the "center" attribute
      // without altering the current graph:
      node = this.nodes(centerId);
      center = {};
      center.center = true;
      for (k1 in node)
        center[k1] = node[k1];

      localNodesIndex[centerId] = true;
      graph.nodes.push(center);

      // Add neighbors and edges between the center and the neighbors:
      for (k1 in this.allNeighborsIndex[centerId]) {
        if (!localNodesIndex[k1]) {
          localNodesIndex[k1] = true;
          graph.nodes.push(this.nodesIndex[k1]);
        }

        for (k2 in this.allNeighborsIndex[centerId][k1])
          if (!localEdgesIndex[k2]) {
            localEdgesIndex[k2] = true;
            graph.edges.push(this.edgesIndex[k2]);
          }
      }

      // Add edges connecting two neighbors:
      for (k1 in localNodesIndex)
        if (k1 !== centerId)
          for (k2 in localNodesIndex)
            if (
              k2 !== centerId &&
              k1 !== k2 &&
              this.allNeighborsIndex[k1][k2]
            )
              for (k3 in this.allNeighborsIndex[k1][k2])
                if (!localEdgesIndex[k3]) {
                  localEdgesIndex[k3] = true;
                  graph.edges.push(this.edgesIndex[k3]);
                }

      // Finally, let's return the final graph:
      return graph;
    }
  );

  sigma.utils.pkg('sigma.plugins');

  /**
   * sigma.plugins.neighborhoods constructor.
   */
  sigma.plugins.neighborhoods = function() {
    var ready = false,
        readyCallbacks = [],
        graph = new sigma.classes.graph();

    /**
     * This method just returns the neighborhood of a node.
     *
     * @param  {string} centerNodeID The ID of the center node.
     * @return {object}              Returns the neighborhood.
     */
    this.neighborhood = function(centerNodeID) {
      return graph.neighborhood(centerNodeID);
    };

    /**
     * This method loads the JSON graph at "path", stores it in the local graph
     * instance, and executes the callback.
     *
     * @param {string}    path     The path of the JSON graph file.
     * @param {?function} callback Eventually a callback to execute.
     */
    this.load = function(path, callback) {
      // Quick XHR polyfill:
      var xhr = (function() {
        if (window.XMLHttpRequest)
          return new XMLHttpRequest();

        var names,
            i;

        if (window.ActiveXObject) {
          names = [
            'Msxml2.XMLHTTP.6.0',
            'Msxml2.XMLHTTP.3.0',
            'Msxml2.XMLHTTP',
            'Microsoft.XMLHTTP'
          ];

          for (i in names)
            try {
              return new ActiveXObject(names[i]);
            } catch (e) {}
        }

        return null;
      })();

      if (!xhr)
        throw 'XMLHttpRequest not supported, cannot load the data.';

      xhr.open('GET', path, true);
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          graph.clear().read(JSON.parse(xhr.responseText));

          if (callback)
            callback();
        }
      };

      // Start loading the file:
      xhr.send();

      return this;
    };

    /**
     * This method cleans the graph instance "reads" a graph into it.
     *
     * @param {object} g The graph object to read.
     */
    this.read = function(g) {
      graph.clear().read(g);
    };
  };
}).call(window);

;(function(undefined) {
  'use strict';

  if (typeof sigma === 'undefined')
    throw 'sigma is not declared';

  if (typeof ShapeLibrary === 'undefined')
    throw 'ShapeLibrary is not declared';
  

  // Initialize package:
  sigma.utils.pkg('sigma.canvas.nodes');

  var sigInst = undefined;
  var imgCache = {};

  var initPlugin = function(inst) {
    sigInst = inst;
  }

  var drawImage = function (node,x,y,size,context) {
    if(sigInst && node.image && node.image.url) {
      var url = node.image.url;
      var ih = node.image.h || 1; // 1 is arbitrary, anyway only the ratio counts
      var iw = node.image.w || 1;
      var scale = node.image.scale || 1;
      var clip = node.image.clip || 1;

      // create new IMG or get from imgCache
      var image = imgCache[url];
      if(!image) {
        image = document.createElement('IMG');
        image.src = url;
        image.onload = function(){
          // TODO see how we redraw on load
          // need to provide the siginst as a parameter to the library
          console.log("redraw on image load");
          sigInst.refresh();
        };
        imgCache[url] = image;
      }

      // calculate position and draw
      var xratio = (iw<ih) ? (iw/ih) : 1;
      var yratio = (ih<iw) ? (ih/iw) : 1;
      var r = size*scale;

      // Draw the clipping disc:
      context.save(); // enter clipping mode
      context.beginPath();
      context.arc(x,y,size*clip,0,Math.PI*2,true);
      context.closePath();
      context.clip();

      // Draw the actual image
      context.drawImage(image,
          x+Math.sin(-3.142/4)*r*xratio,
          y-Math.cos(-3.142/4)*r*yratio,
          r*xratio*2*Math.sin(-3.142/4)*(-1),
          r*yratio*2*Math.cos(-3.142/4));
      context.restore(); // exit clipping mode
    }
  }


  var register = function(name,drawShape,drawBorder) {
    sigma.canvas.nodes[name] = function(node, context, settings) {
      var args = arguments,
          prefix = settings('prefix') || '',
          size = node[prefix + 'size'],
          color = node.color || settings('defaultNodeColor'),
          borderColor = node.borderColor || color,
          x = node[prefix + 'x'],
          y = node[prefix + 'y'];

      context.save();

      if(drawShape) {
        drawShape(node,x,y,size,color,context);
      }

      if(drawBorder) {
        drawBorder(node,x,y,size,borderColor,context);
      }
      
      drawImage(node,x,y,size,context);

      context.restore();
    };
  }

  ShapeLibrary.enumerate().forEach(function(shape) {
    register(shape.name,shape.drawShape,shape.drawBorder);
  });

  /**
   * Exporting
   * ----------
   */
  this.CustomShapes = {

    // Functions
    init: initPlugin,
    // add pre-cache images

    // Version
    version: '0.1'
  };



}).call(this);

/**
* This plugin computes HITS statistics (Authority and Hub measures) for each node of the graph.
* It adds to the graph model a method called "HITS".
*
* Author: Mehdi El Fadil, Mango Information Systems
* License: This plugin for sigma.js follows the same licensing terms as sigma.js library.
* 
* This implementation is based on the original paper J. Kleinberg, Authoritative Sources in a Hyperlinked Environment (http://www.cs.cornell.edu/home/kleinber/auth.pdf), and is inspired by implementation in Gephi software (Patick J. McSweeney <pjmcswee@syr.edu>, Sebastien Heymann <seb@gephi.org>, Dual-licensed under GPL v3 and CDDL)
* https://github.com/Mango-information-systems/gephi/blob/fix-hits/modules/StatisticsPlugin/src/main/java/org/gephi/statistics/plugin/Hits.java
* 
* Bugs in Gephi implementation should not be found in this implementation.
* Tests have been put in place based on a test plan used to test implementation in Gephi, cf. discussion here: https://github.com/jacomyal/sigma.js/issues/309
* No guarantee is provided regarding the correctness of the calculations. Plugin author did not control the validity of the test scenarii.
* 
* Warning: tricky edge-case. Hubs and authorities for nodes without any edge are only reliable in an undirected graph calculation mode. 
* 
* Check the code for more information.
*
* Here is how to use it:
*
* > // directed graph
* > var stats = s.graph.HITS()
* > // returns an object indexed by node Id with the authority and hub measures
* > // like { "n0": {"authority": 0.00343, "hub": 0.023975}, "n1": [...]*
* 
* > // undirected graph: pass 'true' as function parameter
* > var stats = s.graph.HITS(true)
* > // returns an object indexed by node Id with the authority and hub measures
* > // like { "n0": {"authority": 0.00343, "hub": 0.023975}, "n1": [...]
*/

(function() {
  'use strict';

  if (typeof sigma === 'undefined')
    throw 'sigma is not declared';

/**
* This method takes a graph instance and returns authority and hub measures computed for each node. It uses the built-in
* indexes from sigma's graph model to search in the graph.
*
* @param {boolean} isUndirected flag informing whether the graph is directed or not. Default false: directed graph.
* @return {object} object indexed by node Ids, containing authority and hub measures for each node of the graph.
*/

  sigma.classes.graph.addMethod(
    'HITS',
    function(isUndirected) {
      var res = {}
      , epsilon = 0.0001
      , hubList = []
      , authList = []
      , nodes = this.nodes()
      , nodesCount = nodes.length
      , tempRes = {}

      if (!isUndirected)
        isUndirected = false

      for (var i in nodes) {
     
        if (isUndirected) {
          hubList.push(nodes[i])
          authList.push(nodes[i])
        }
        else {
          if (this.degree(nodes[i].id, 'out') > 0)
            hubList.push(nodes[i])
            
          if (this.degree(nodes[i].id, 'in') > 0)
            authList.push(nodes[i])
        }
        
        res[nodes[i].id] = { authority : 1, hub: 1 }
      }

      var done
      
      while (true) {
        done  = true
        var authSum = 0
          , hubSum = 0
        
        for (var i in authList) {
          
          tempRes[authList[i].id] = {authority : 1, hub:0 }
          
          var connectedNodes = []

          if (isUndirected)
            connectedNodes =  this.allNeighborsIndex[authList[i].id]
          else
            connectedNodes =  this.inNeighborsIndex[authList[i].id]
          
          for (var j in connectedNodes) {
            if (j != authList[i].id)
              tempRes[authList[i].id].authority += res[j].hub
          }
          
          authSum += tempRes[authList[i].id].authority
          
        }
        
        for (var i in hubList) {
          
          if (tempRes[hubList[i].id])
            tempRes[hubList[i].id].hub = 1
          else
            tempRes[hubList[i].id] = {authority: 0, hub : 1 }
          
          var connectedNodes = []
          
          if (isUndirected)
            connectedNodes =  this.allNeighborsIndex[hubList[i].id]
          else
            connectedNodes =  this.outNeighborsIndex[hubList[i].id]
          
          for (var j in connectedNodes) {
            if (j != hubList[i].id)
              tempRes[hubList[i].id].hub += res[j].authority
          }
          
          hubSum += tempRes[hubList[i].id].hub
          
        }
        
        for (var i in authList) {
          tempRes[authList[i].id].authority /= authSum
          
          if (Math.abs((tempRes[authList[i].id].authority - res[authList[i].id].authority) / res[authList[i].id].authority) >= epsilon)
            done = false
        }
        
        for (var i in hubList) {
          tempRes[hubList[i].id].hub /= hubSum
          
          if (Math.abs((tempRes[hubList[i].id].hub - res[hubList[i].id].hub) / res[hubList[i].id].hub) >= epsilon)
            done = false
        }
        res = tempRes
        
        tempRes = {}

        if (done)
          break
        
      }

      return res

    }
  )

}).call(window)

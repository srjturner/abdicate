var recursive = require('recursive-readdir')
var dag = require('breeze-dag')
var Promise = require('promise')
var annotations = require('annotations')
var readAnnotationsFor = Promise.denodeify(annotations.get)
var Requires = require('./requires')
var Provides = require('./provides')
var InstanceFactory = require('./instancefactory')

// TODO: better logging solution

/**
 * Constructor of a DI context
 * 
 * @param rootpaths   An array of paths to scan for components
 */
var Context = function(rootpaths) {
  this.rootpaths = rootpaths
  this.factories = {}
  this.instances = {}
}

/* == API == */

/**
 * Explicitly register an instance (or a function to create one) with this Context
 * 
 * @param name                      The logical name of the Object
 * @param factoryMethodOrInstance   The factory method to produce instances, or else a literal instance 
 * @param forceIntance              Treat factoryMethodOrInstance as an instance even if it instanceof Funtion == true 
 * @param scope                     The scope ('prototype' or 'singleton') of the Object
 * @param async                     False (for synchronous factory methods), 'promise' or 'callback'
 * @param dependencies              An array of other logical names that the factory method requires when called.
 */
Context.prototype.register = function(name, factoryMethodOrInstance, forceIntance, scope, async, dependencies) {
  this.factories[name] = new InstanceFactory(name, factoryMethodOrInstance, forceIntance, scope, async, dependencies)
}

/**
 * Scan the paths and read the annotated modules in those paths to create the set of InstanceFactories.
 * If eager=true then also resolve their dependencies to 'bootstrap' this Context and populate Context.instances. 
 * In any case, will asynchronously return itself either via the Callback (if provided) or else as a Promise.
 * 
 * @param callback    The (optional) callback for non-Promise based invocation. 
 * @returns {Promise} that resolves to the Context itself (if not using Node-style callbacks)
 */
Context.prototype.bootstrap = function(eager, callback) {
  var self = this
  var result = findFiles(this.rootpaths).then(function(filepaths) {
    return readAnnotations(self, filepaths).then(function() {
      if (eager) {
        var edges = buildEdges(self.factories)
        return traverseDag(self, edges)
      } else {
        return Promise.resolve(self)
      }
    })
  })
  return result.nodeify(callback)
}

/**
 * Get the Object instance corresponding to the logical name. This will return a Promise if no callback is 
 * supplied, otherwise it will invoke the callback in the standard NodeJs (err, result) style.
 * 
 * The instance will be created new if it's scope = "prototype" otherwise will return the same
 * instance each time (scope = 'singleton').
 * 
 * @param name        The logical name (within this context) of the instance to get
 * @param callback    The (optional) callback for non-Promise style invocation. 
 * @returns {Promise} that resolves to the requested Object instance (if not using Node-style callbacks)
 */
Context.prototype.getInstance = function(name, callback) {
  var self = this
  var promise = new Promise(function (resolve, reject) {
    try {
      var instance = self.instances[name]
      var fac = self.factories[name]
      if (instance && fac && fac.scope != 'prototype') {
        resolve(instance)
      } else if (fac) {
        fac.build(self).then(function(instance) {
          self.instances[name] = instance
          resolve(instance)
        }, function(err) {
          reject(err)
        }) 
      } else {
        console.log("No InstanceFactory for " + name)
        resolve(null)
      }
    } catch (err) {
      reject(err)
    }
  })
  return promise.nodeify(callback)
}

/**
 * Get a (sub)set of objects in this context. Any that are scope='prototype' will be created 
 * afresh. If the same name is provided more than once then the name will be mapped to an 
 * array of instances.
 * 
 * @param names       The logical names (within this context) of the instances to get
 * @param callback    The (optional) callback for non-Promise based invocation. 
 * @returns {Promise} that resolves to a map of name -> instance || [instances] (if not using Node-style callbacks)
 */
Context.prototype.getInstances = function(names, callback) {
  var self = this
  var results = {}
  var promises = []
  names.forEach(function(name) {
    promises.push( 
      self.getInstance(name).then(function(instance) {
        if (results.hasOwnProperty(name)) {
          var current = results[name] 
          if (!(current instanceof Array)) {
            current = [current]
            results[name] = current
          }
          current.push(instance)
        } else {
          results[name] = instance
        }
      })
    )
  })
  return Promise.all(promises).then(function() {
    return results
  }).nodeify(callback)
}

module.exports = Context

/* == Helpers == */

/**
 * Scan the rootpaths for annotated modules
 *  
 * @returns {Promise} that resolves to an array of filepaths
 */
var findFiles = function(rootpaths) {
  return new Promise(function (resolve, reject) {
    var counter = 0
    var filepaths = []
    rootpaths.forEach(function(rootpath) {
      recursive(rootpath, function (err, files) {
        if (err) {
          reject(err)
        } else {
          filepaths = filepaths.concat(files)
          counter++
          if (counter == rootpaths.length) {
            resolve(filepaths)
          }
        }
      })
    })
  })
}

/**
 * Read the annotations in the filepaths and register appropriate InstanceFactories
 * with the Context.
 *  
 * @returns {Promise} that resolves to nothing.
 */
var readAnnotations = function(context, filepaths) {
  var promises = []
  filepaths.forEach(function(path) {
    if (endsWith(path, '.js')) {
      promises.push(
        readAnnotationsFor(path).then(function(pathAnnotations) {
          forEachKey(pathAnnotations, function(target, functionAnnotations) {
            var isAsync = false
            var dependencies = []
            var name = defaultName(path, context.rootpaths, target)
            var scope = 'singleton'
            var async = false
            forEachKey(functionAnnotations, function(annotationName, annotationContent) {
              if (annotationName == 'Requires') {
                var requires = new Requires(path, target, annotationContent)
                dependencies = requires.value
              } else if (annotationName == 'Provides') {
                provides = new Provides(path, target, annotationContent)
                name = provides.name
                scope = provides.scope
                async = provides.async
              }
            })
            var factoryMethod = toFactoryMethod(path, target)
            if (factoryMethod) context.register(name, factoryMethod, false, scope, async, dependencies)
            else console.log("Could not resolve the target " + target + " for " + path)
          })          
        })    
      )  
    }
  })
  return Promise.all(promises)
}

/**
 * Fallback when no @Provides annotation is available to specify the logical name.
 */
function defaultName(path, rootpaths, target) {
  rootpaths.forEach(function(rootPath) {
    if (path.indexOf(rootPath) == 0) {
      return path.substring(rootPath.length).replace(/\//g, '.').replace('.js', '.') + target
    }
  })
  return path
}

/**
 * Find the function implied by the target for the module at the path. Fallback is to read in 
 * the file explicitly and look for an instance in scope
 */
var toFactoryMethod = function(path, target) {
  var module = require(path)
  var modTarget = module[target]
  if (modTarget) {
    return modTarget
  } else if (module instanceof Function) {
    return module // assumption is that the exported function IS the target
  } else { // not a CommonJS module, or a module that does not export the target
    var fs = require('fs')
    buf = fs.readFileSync(path)
    var txt = buf.toString()
    eval(txt) // evaluate the JS to declare any functions in local (this function) scope
    return eval(target) // evaluate the target-name to access the newly-declared function
  }
}

/**
 * Transform the dependencies specified by the map of factories into the edges of the DAG 
 * 
 * @factories   The InstanceFactories containing the dependencies from which the DAG is created
 * @returns     The DAG: nested arrays of [[providerName, requirerName]
 */
var buildEdges = function(factories) {
  var edges = []
  forEachKey(factories, function(name, fac) {
    fac.dependencies.forEach(function(dependency) {
      edges.push([dependency, name])
    })
    if (fac.dependencies.length == 0) {
      edges.push([name, 'Nothing'])
    }
  })
  return edges
}

/**
 * Traverse the edges of the DAG, creating an instance of each Object and returning
 * the Context, now with Context.instances populated.
 * 
 * @param context     The instance of DI context
 * @param edges       The edges of the DAG (pairs of logical names from provider to requirer)
 * @returns {Promise}
 */
var traverseDag = function(context, edges) {
  return new Promise(function (resolve, reject) {
    dag(edges, 1, function(name, next) {
      var fac = context.factories[name]
      if (fac) {
        fac.build(context).then(function(instance) {
          context.instances[name] = instance
          next()
        })
      } else {
        console.log("No InstanceFactory for " + name)
        next()
      }
    }, function (err) {
      if (err) reject(err)
      else {
        resolve(context)
      }
    })
  })
}
   
//Iterate through an Object as if it were an associative array (map)
var forEachKey = function(map, fun) {
  for(var key in map) {
    if (map.hasOwnProperty(key)) {
      fun(key, map[key])
    }
  }
}

var endsWith = function(str, suffix) {
  return str.indexOf(suffix, str.length - suffix.length) !== -1;
}


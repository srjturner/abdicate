var Promise = require('promise')
var recursive = Promise.denodeify(require('recursive-readdir'))
var dag = require('breeze-dag')
var annotations = require('annotations')
var readAnnotationsFor = Promise.denodeify(annotations.get)
var R = require('ramda')
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
  return new Promise(function (resolve, reject) {
    try {
      var instance = self.instances[name]
      var fac = self.factories[name]
      if (instance && fac && fac.scope != 'prototype') {
        resolve(instance)
      } else if (fac) {
        return fac.build(self).then(cache(self, name)).then(resolve, reject) 
      } else {
        console.log("No InstanceFactory for " + name)
        resolve(null)
      }
    } catch (err) {
      reject(err)
    }
  }).nodeify(callback)
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
  return Promise.all(R.map(function(name) {
        return self.getInstance(name)
      }, names)
    ).then(function(instances) {
      return R.compose(
        R.mapObj(function(namedInstances) {
          if (namedInstances.length == 1) return namedInstances[0] 
          else return namedInstances 
        }), 
        R.mapObj(R.chain(function(namedInstances) {
          return namedInstances[1]
        })), 
        R.groupBy(function(namedInstance) {
          return namedInstance[0]
        }), 
        R.zip(names))(instances)
      })
    .nodeify(callback)
}

module.exports = Context

/* == Helpers == */

/**
 * A curried function to cache an instance against a name in a Context ('self') 
 */
var cache = R.curry(function(self, name, instance) {
  self.instances[name] = instance
  return instance
})

/**
 * Scan the rootpaths for annotated modules
 *  
 * @returns {Promise} that resolves to an array of filepaths
 */
var findFiles = function(rootpaths) {
  return Promise.all(R.map(recursive, rootpaths)).then(R.flatten)
}

/**
 * Read the annotations in the filepaths and register appropriate InstanceFactories
 * with the Context.
 *  
 * @returns {Promise} that resolves to nothing.
 */
var readAnnotations = function(context, filepaths) {
  var registerFunctionAtPath = R.curry(function(path, functionAnnotations, functionName) {
    var settings = {name: defaultName(path, context.rootpaths, functionName), scope: 'singleton', async: false, dependencies: []}
    R.mapObjIndexed(R.curry(parseAnnotation)(settings), functionAnnotations)
    var factoryFunction = toFactoryFunction(path, functionName)
    if (factoryFunction) context.register(settings.name, factoryFunction, false, settings.scope, settings.async, settings.dependencies)
    else console.log("Could not resolve the target " + functionName + " for " + path)
  })
  var parseAnnotation = function(settings, annotationContent, annotationName) {
    if (annotationName == 'Requires') {
      var requires = new Requires(annotationContent)
      settings.dependencies = requires.value
    } else if (annotationName == 'Provides') {
      var provides = new Provides(annotationContent)
      settings.name = provides.name
      settings.scope = provides.scope
      settings.async = provides.async
    }
  }
  var isJavascript = function(path) {
    return path.indexOf('.js', path.length - '.js'.length) !== -1;
  }
  var registerFunctionsAtPath = function(path) {
    return readAnnotationsFor(path).then(R.mapObjIndexed(registerFunctionAtPath(path)))
  }
  var promises = R.compose(R.map(registerFunctionsAtPath), R.filter(isJavascript))(filepaths)
  return Promise.all(promises)
}

/**
 * Fallback when no @Provides annotation is available to specify the logical name.
 */
function defaultName(path, rootpaths, functionName) {
  var pathMatchesRoot = R.curry(function(path, rootPath) {
    return path.indexOf(rootPath) == 0
  })
  var toName = R.curry(function(path, functionName, rootpath) {
    return path.substring(rootpath.length).replace(/\//g, '.').replace('.js', '.') + functionName
  })
  var defaultNames = R.compose(toName(path, functionName), R.filter(pathMatchesRoot(path)))(rootpaths)
  if (defaultNames.length > 0) return defaultNames[0]
  else return path
}

/**
 * Find the function implied by the target for the module at the path. Fallback is to read in 
 * the file explicitly and look for an instance in scope
 */
var toFactoryFunction = function(path, functionName) {
  var module = require(path)
  var modFunction = module[functionName]
  if (modFunction) {
    return modFunction
  } else if (module instanceof Function) {
    return module // assumption is that the exported function IS the target
  } else { // not a CommonJS module, or a module that does not export the target
    var fs = require('fs')
    buf = fs.readFileSync(path)
    eval(buf.toString()) // evaluate the JS to declare any functions in local (this function) scope
    return eval(functionName) // evaluate the target-name to access the newly-declared function
  }
}

/**
 * Transform the dependencies specified by the map of InstanceFactories into the edges of the DAG 
 * 
 * @factories   The InstanceFactories containing the dependencies from which the DAG is created
 * @returns     The DAG: nested arrays of [[providerName, requirerName]
 */
var buildEdges = function(instanceFactories) {
  var edgesForInstance = function(instanceFactory, name) {
    if (instanceFactory.dependencies.length == 0) {
      return [[name, 'Nothing']]
    } else return R.map(function(dependency) {
      return [dependency, name]
    }, instanceFactory.dependencies)
  }
  return R.compose(R.unnest, R.values, R.mapObjIndexed(edgesForInstance))(instanceFactories)
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
      context.getInstance(name).then(function() {
        next() // can't do then(next) because next is "next(err)"
      })
    }, function (err) {
      if (err) reject(err)
      else resolve(context)
    })
  })
}


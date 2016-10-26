var R = require('ramda')
var Promise = require('promise')
var recursiveRead = Promise.denodeify(require('recursive-readdir'))
var dag = require('breeze-dag')
var annotations = require('annotations')
var readAnnotationsFor = Promise.denodeify(annotations.get)
var Requires = require('./requires')
var Provides = require('./provides')
var InstanceFactory = require('./instancefactory')

/**
 * Constructor of a DI context
 * 
 * @param rootpaths   An array of paths to scan for components
 */
var Context = function(rootpaths) {
  this.rootpaths = ensureTrailingSlash(rootpaths)
  this.factories = {}
  this.instances = {}
}

/* == API == */

/**
 * Explicitly register an instance (or a function to create one) with this Context
 * 
 * @param name                      The logical name of the object instance(s) produced by the function
 * @param factoryMethodOrInstance   The factory method to produce instances, or else a literal instance 
 * @param forceIntance              Treat factoryMethodOrInstance as an instance even if instanceof Funtion == true 
 * @param scope                     The scope ('prototype' or 'singleton') of the object
 * @param async                     False (for synchronous factory methods), 'promise' or 'callback'
 * @param dependencies              An array of other logical names that the factory method requires when called.
 */
Context.prototype.register = function(name, factoryMethodOrInstance, forceIntance, scope, async, dependencies) {
  this.factories[name] = new InstanceFactory(name, factoryMethodOrInstance, forceIntance, scope, async, dependencies)
}

/**
 * Scan the paths and read the annotated modules in those paths to register the annotated functions.
 * If eager=true then this also populates the Context's instances. In any case, will asynchronously 
 * return itself either via the Callback (if provided) or else as a Promise.
 * 
 * @param callback    The (optional) callback for non-Promise based invocation. 
 * @returns {Promise} that resolves to the Context itself (if not using Node-style callbacks)
 */
Context.prototype.bootstrap = function(eager, callback) {
  var self = this
  return findFiles(self.rootpaths)
    .then(applyAnnotations(self))
    .then(function() {
      if (eager) return populate(self)
      else return Promise.resolve(self)
    }).nodeify(callback)
}

/**
 * Get the object instance corresponding to the logical name. This will return a Promise if no callback is 
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
    var instance = self.instances[name]
    var fac = self.factories[name]
    if (instance && fac && fac.scope != 'prototype') {
      resolve(instance)
    } else if (fac) {
      return fac.build(self).then(cache(self, name)).then(resolve, function(err) {
        console.log('Rejecting due to ' + err)
        reject(err)
      }) 
    } else {
      if (name !== DUMMY_DEPENDENT) console.log("No InstanceFactory for " + name)
      resolve(null)
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
  return Promise.all(
      R.map(
        R.bind(self.getInstance, self)
      ) (names)
    ).then(
      R.compose(
        R.mapObj(function(instancesOfSomeName) { // 4. unpack the array values which have just 1 value
          if (instancesOfSomeName.length == 1) return instancesOfSomeName[0] 
          else return instancesOfSomeName 
        }), 
        R.mapObj(R.chain(function(namedInstances) { // 3. convert the values for each name to arrays of just instances
          return namedInstances[1]
        })), 
        R.groupBy(function(namedInstance) { // 2. group the instances by name
          return namedInstance[0]
        }), 
        R.zip(names) // 1. pair the instances with their names
      )
    ).nodeify(callback)
}

module.exports = Context

/* == Private functions == */

var DUMMY_DEPENDENT = '__DUMMY_DEPENDENT__'

/** For an Array of directory-paths, make sure that the last character in each is a forward slash */
var ensureTrailingSlash = function(dirPaths) {
  return R.map((p) => {
    if (p.endsWith('/')) return p
    else return p + '/'
  }, dirPaths)
}

/** Cache an instance against a name in a Context ('self') and return that instance (for function-chaining) */
var cache = R.curry(function(context, name, instance) {
  context.instances[name] = instance
  return instance
})

/**
 * Scan the rootpaths for annotated modules
 *  
 * @returns {Promise} that resolves to an array of filepaths
 */
var findFiles = function(rootpaths) {
  return Promise.all(R.map(recursiveRead, rootpaths)).then(R.flatten)
}

/**
 * Read the annotations in the filepaths and register appropriate InstanceFactories with the Context.
 *  
 * @returns {Promise} that resolves to nothing.
 */
var applyAnnotations = R.curry(function(context, filepaths) {
  var promises = R.compose(R.map(applyAnnotationsAtPath(context)), R.filter(isJavascript))(filepaths)
  return Promise.all(promises)
})

/** Is the path a Javascript file? */
var isJavascript = function(path) {
  return path.indexOf('.js', path.length - '.js'.length) !== -1;
}

/** Return a Promise to register with the Context all annotated functions which are found in a file */
var applyAnnotationsAtPath = R.curry(function(context, path) {
  return readAnnotationsFor(path).then(
    R.compose(Promise.all, R.values, R.mapObjIndexed(registerFunctionAtPath(context, path)), cleanEmptyProps)
  )
})

/** Clean any properties from an Object where the value is empty */
var cleanEmptyProps = function(obj) {
  for (var propName in obj) { 
    if (isEmptyObject(obj[propName])) {
      delete obj[propName]
    }
  }
  return obj
}

/** Is the supplied Object empty? i.e. is it {} ? */
var isEmptyObject = function(obj) {
  return Object.keys(obj).length === 0 && obj.constructor === Object
}

/** Return a Promise to register  with the Context a single annotated function which is found in the file */
var registerFunctionAtPath = R.curry(function(context, path, functionAnnotations, functionName) {
  return toFactoryFunction(path, functionName).then(function(func) {
    if (func) {
      var defaults = {name: defaultName(functionName, path, context.rootpaths), scope: 'singleton', async: false, dependencies: []}
      var settings = R.compose(R.merge(defaults), R.mergeAll, R.values, R.mapObjIndexed(parseAnnotation))(functionAnnotations)
      context.register(settings.name, func, false, settings.scope, settings.async, settings.dependencies)
    }
  })
})

/** Parse an annotation and return an object indicating what is declared there */
var parseAnnotation = function(annotationContent, annotationName) {
  if (annotationName == 'Requires') {
    return new Requires(annotationContent)
  } else if (annotationName == 'Provides') {
    return new Provides(annotationContent)
  }
}

/** Fallback when no @Provides annotation is available to specify the logical name */
function defaultName(functionName, path, rootpaths) {
  var defaultName = R.compose(toName(functionName, path), R.head, R.filter(pathMatchesRoot(path)))(rootpaths)
  if (defaultName.length > 0) return defaultName
  else return path
}

/** Get the name for a function at path within rootpath */
var toName = R.curry(function(functionName, path, rootpath) {
  return path.substring(rootpath.length).replace(/\//g, '.').replace('.js', '.') + functionName
})

/** Does the path start with the root path? */
var pathMatchesRoot = R.curry(function(path, rootPath) {
  return path.indexOf(rootPath) == 0
})

/**
 * Return a Promise to find the actual function implied by a functionName in a file. 
 */
var toFactoryFunction = function(path, functionName) {
  return new Promise(function (resolve, reject) {
    var module = require(path)
    var modFunction = module[functionName]
    if (modFunction) {
      resolve(modFunction)
    } else if (module instanceof Function) {
      resolve(module) // assumption is that the exported function IS the target
    } else { // not a CommonJS module, or a module that does not export the target
      var fs = require('fs')
      fs.readFile(path, function(err, buf) {
        if (err) {
          reject(err)
        } else {
          eval(buf.toString()) // evaluate the JS to declare any functions in local (this function) scope
          var result = eval(functionName) // evaluate the target-name to access the newly-declared function
          if (!result) console.log("Could not resolve the target " + functionName + " for " + path)
          resolve(result) 
        }
      })
    }
  })
}

/**
 * Populate Context.instances for all functions registered with the Context.
 * Returns the updated Context either via the Callback (if provided) or else as a Promise.
 * 
 * @param callback    The (optional) callback for non-Promise based invocation. 
 * @returns {Promise} that resolves to the Context itself (if not using Node-style callbacks)
 */
var populate = function(context) {
  return Promise.resolve(buildEdges(context.factories)).then(traverseDag(context))
}

/**
 * Transform the dependencies specified by the map of InstanceFactories into the edges of the DAG 
 * 
 * @factories   The map of names->InstanceFactories containing the dependencies from which the DAG is created
 * @returns     The DAG: nested arrays of [[providerName, requirerName]
 */
var buildEdges = function(instanceFactories) {
  return R.compose(R.unnest, R.values, R.mapObj(edgesForInstance))(instanceFactories)
}

/** 
 * Get the edges of the DAG implied by the dependencies of an InstanceFactory (if any) 
 * or else a single fallback edge 
 */
var edgesForInstance = function(instanceFactory) {
  if (instanceFactory.dependencies.length == 0) {
    return [[instanceFactory.name, DUMMY_DEPENDENT]]
  } else return R.map(
      function(dependency) {
        return [dependency, instanceFactory.name]
      }
    ) (instanceFactory.dependencies)
}

/**
 * Traverse the edges of the DAG, creating an instance of each Object and returning
 * the Context, now with Context.instances populated.
 * 
 * @param context     The instance of DI context
 * @param edges       The edges of the DAG (pairs of logical names from provider to requirer)
 * @returns {Promise}
 */
var traverseDag = R.curry(function(context, edges) {
  return new Promise(function (resolve, reject) {
    dag(edges, 1, 
      function(name, next) {
        context.getInstance(name).then(
          function() {
            next()
          }, 
          next // i.e. next(err) - pass errors from getInstance() back to DAG 
        )
      }, function (err) {
        if (err) reject(err)
        else resolve(context)
      }
    )
  })
})


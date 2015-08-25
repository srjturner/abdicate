var R = require('ramda')
var Promise = require('promise')

/**
 * A factory that produces instances of some object via some factory method (or by simply returning 
 * an instance literal). Knows the asynchonicity of that factory method (i.e. whether it takes a 
 * callback or returns a promise, or whether it is synchronous).
 */
var InstanceFactory = function(name, factoryMethodOrInstance, forceInstance, scope, async, dependencies) {
  this.name = name
  if (!forceInstance && factoryMethodOrInstance instanceof Function) {
    this.factoryMethod = factoryMethodOrInstance
    this.async = async || false
  } else { // pre-canned instance
    this.instance = factoryMethodOrInstance
    this.factoryMethod = function(callback) {
      return instance
    }
    this.async = false
  }
  this.scope = scope || 'singleton'
  this.dependencies = dependencies || []
}

/** Cache the instance in the InstanceFactory */
InstanceFactory.prototype.cache = function (instance) {
  this.instance = instance
  return instance
}
  
/**
 * Build (or return from cache) an instance of the underlying Object.
 * 
 * @param context The instance of di/context to use for fetching dependencies from
 * @returns {Promise}
 */
InstanceFactory.prototype.build = function(context) { 
  if (this.instance === undefined) {
    var result = createInstance(this.dependencies, this.async, this.factoryMethod, context)
    if (this.scope === 'singleton') return result.then(R.bind(this.cache, this))
    else return result
  } else { 
    return Promise.resolve(this.instance)
  }
}

module.exports = InstanceFactory

/* == Private functions == */

/** Create an instance */
var createInstance = function(dependencies, async, factoryMethod, context) {
  return getArgs(dependencies, context).then(apply(factoryMethod, async))
}

/** Use the Context to assemble the instances to populate the arguments to the factory method */
var getArgs = function(dependencies, context) {
  var promises = []
  dependencies.forEach(function(name) {
    promises.push(context.getInstance(name))
  })
  return Promise.all(promises)
}

/** Apply the factory method to the arguments to create an instance */
var apply = R.curry(function(factoryMethod, async, args) {
  if (async == 'promise') {
    return factoryMethod.apply(this, args)
  } else if (async == 'callback') {
    var fun = Promise.denodeify(factoryMethod)
    return fun.apply(this, args)
  } else {
    instance = Object.create(factoryMethod.prototype)
    var returned = factoryMethod.apply(instance, args)
    return returned || instance
  }
})

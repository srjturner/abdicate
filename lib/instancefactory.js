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
  console.log(this)
  return instance
}
  
/**
 * Build (or return from cache) an instance of the underlying Object.
 * 
 * @param context The instance of di/context to use for fetching dependencies from
 * @returns {Promise}
 */
InstanceFactory.prototype.build = function(context) { 
  if (this.scope == 'prototype') return prototypeBuild(this.dependencies, this.async, this.factoryMethod, context)
  else return singletonBuild(this.instance, this.dependencies, this.async, this.factoryMethod, context).then(R.bind(this.cache, this))
}

module.exports = InstanceFactory

/* == Private functions == */

/** Build process when every instance is newly-created */
var prototypeBuild = function(dependencies, async, factoryMethod, context) {
  return getArgs(dependencies, context).then(create(async, factoryMethod))
}

/** Build process when there is only ever one instance created */
var singletonBuild = function(instance, dependencies, async, factoryMethod, context) { 
  if (instance == undefined) {
    return prototypeBuild(dependencies, async, factoryMethod, context)
  } else {
    return Promise.resolve(instance)
  }
}

/** Use the Context to assemble the instances to populate the arguments to the factory method */
var getArgs = R.curry(function(dependencies, context) {
  var promises = []
  dependencies.forEach(function(name) {
    promises.push(context.getInstance(name))
  })
  return Promise.all(promises)
})

/** Create a/the instance using the factory method */
var create = R.curry(function(async, factoryMethod, args) {
  if (async == 'promise') {
    return factoryMethod.apply(this, args)
  } else if (async == 'callback') {
    var fun = Promise.denodeify(factoryMethod)
    return fun.apply(this, args)
  } else {
    instance = Object.create(factoryMethod.prototype)
    factoryMethod.apply(instance, args)
    return instance
  }
})

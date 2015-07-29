var R = require('ramda')
var Promise = require('promise')

/**
 * A factory that produces instances of some Object via some factory method (or by simply returning 
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
  
/**
 * Build (or return from cache) an instance of the underlying Object.
 * 
 * @param context The instance of di/context to use for fetching dependencies from
 * @returns {Promise}
 */
InstanceFactory.prototype.build = function(context) { 
  var self = this
  return new Promise(function (fulfill, reject) {
    if (self.scope == 'prototype') fulfill(prototypeBuild(self, context))
    else fulfill(singletonBuild(self, context))
  })
}

module.exports = InstanceFactory

/* == Private functions == */

/** Build process when every instance is newly-created */
var prototypeBuild = function(fac, context) {
  return getArgs(fac, context).then(create(fac))
}

/** Build process when there is only ever one instance created */
var singletonBuild = function(fac, context) { 
  if (fac.instance == undefined) {
    return getArgs(fac, context).then(create(fac)).then(cache(fac))
  } else {
    return Promise.resolve(fac.instance)
  }
}

/** Use the Context to assemble the instances to populate the arguments to the factory method */
var getArgs = R.curry(function(fac, context) {
  var promises = []
  fac.dependencies.forEach(function(name) {
    promises.push(context.getInstance(name))
  })
  return Promise.all(promises)
})

/** Create a/the instance using the factory method */
var create = R.curry(function(fac, args) {
  if (fac.async == 'promise') {
    return fac.factoryMethod.apply(this, args)
  } else if (fac.async == 'callback') {
    var fun = Promise.denodeify(fac.factoryMethod)
    return fun.apply(this, args)
  } else {
    instance = Object.create(fac.factoryMethod.prototype)
    fac.factoryMethod.apply(instance, args)
    return instance
  }
})

/** Cache the instance */
var cache = R.curry(function (fac, instance) {
  fac.instance = instance
  return instance
})
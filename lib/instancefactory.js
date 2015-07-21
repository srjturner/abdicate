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
  var getArgs = R.curry(function(self, context) {
    var promises = []
    self.dependencies.forEach(function(name) {
      promises.push(context.getInstance(name))
    })
    return Promise.all(promises)
  })
  var create = R.curry(function(self, args) {
    if (self.async == 'promise') {
      return self.factoryMethod.apply(this, args)
    } else if (self.async == 'callback') {
      var fun = Promise.denodeify(self.factoryMethod)
      return fun.apply(this, args)
    } else {
      instance = Object.create(self.factoryMethod.prototype)
      self.factoryMethod.apply(instance, args)
      return instance
    }
  })
  var cache = R.curry(function (self, instance) {
    self.instance = instance
    return instance
  })
  var prototypeBuild = function(context) {
    return getArgs(self, context).then(create(self))
  }
  var singletonBuild = function(context) { 
    if (self.instance == undefined) {
      return getArgs(self, context).then(create(self)).then(cache(self))
    } else {
      return Promise.resolve(self.instance)
    }
  }
  var self = this
  return new Promise(function (fulfill, reject) {
    if (self.scope == 'prototype') fulfill(prototypeBuild(context))
    else fulfill(singletonBuild(context))
  })
}


module.exports = InstanceFactory
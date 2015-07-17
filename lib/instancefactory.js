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
  var getArgs = function(context) {
    var promises = []
    instanceFactory.dependencies.forEach(function(name) {
      promises.push(context.getInstance(name))
    })
    return Promise.all(promises)
  }
  var create = function(args) {
    if (instanceFactory.async == 'promise') {
      return instanceFactory.factoryMethod.apply(this, args)
    } else if (instanceFactory.async == 'callback') {
      var fun = Promise.denodeify(instanceFactory.factoryMethod)
      return fun.apply(this, args)
    } else {
      instance = Object.create(instanceFactory.factoryMethod.prototype)
      instanceFactory.factoryMethod.apply(instance, args)
      return instance
    }
  }
  var prototypeBuild = function(context) {
    return getArgs(context).then(create)
  }
  var singletonBuild = function(context) { 
    if (instanceFactory.instance == undefined) {
      return getArgs(context).then(create).then(function(instance) {
        instanceFactory.instance = instance
        return instance
      })
    } else {
      return Promise.resolve(instanceFactory.instance)
    }
  }
  var instanceFactory = this
  return new Promise(function (fulfill, reject) {
    if (instanceFactory.scope == 'prototype') fulfill(prototypeBuild(context))
    else fulfill(singletonBuild(context))
  })
}


module.exports = InstanceFactory
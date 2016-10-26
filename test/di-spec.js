var Context = require('lib/context')
var R = require('ramda')
var path = require('path')

describe('abdicate', function() {
  
  var context = undefined
  var modelStringValue = 'modelStringValue'
  var nonModuleStringValue = 'nonModuleStringValue'
  var dbUri = 'mongodb://foo'
      
  var errorHandler = R.curry(function(done, err) {
    this.fail(err)
    done()
  })
  
  beforeEach(function(done) {
    context = new Context([ path.join(__dirname, 'files/') ])
    context.register('model.string', modelStringValue)
    context.register('non.module.string', nonModuleStringValue)
    context.register('db.config', {uri: dbUri})
    done()
  })
   
  it('instantiates and caches objects when eagerly bootstrapped', function(done) {
    context.bootstrap(true)
      .then(function(context) {
        expect(context.instances['my.model'].string).toEqual(modelStringValue)
        done()
      }, 
      errorHandler(done))
  })
  
  it('handles async factory methods using Promises', function(done) {
    context.bootstrap(true)
      .then(function(context) {
        expect(context.instances['withpromise']).toBeDefined()
        done()
      }, 
      errorHandler(done))
  })
  
  it('handles async factory methods using Callbacks', function(done) {
    context.bootstrap(true)
      .then(function(context) {
        expect(context.instances['my.connection']).toBeDefined()
        done()
      }, 
      errorHandler(done))
  })
  
  it('waits for callbacks from async factory methods while bootstrapping', function(done) {
    context.bootstrap(false).then(function(context) {
      context.getInstance('my.model', function(err, model) {
        if (err) fail(err)
        else expect(model.connection).toBeDefined()
        done()
      })
    }, errorHandler(done))
  })
  
  it('handles multiple objects defined in a single module', function(done) {
    var multipleStringValue1 = 'multipleStringValue1'
    var multipleStringValue2 = 'multipleStringValue2'
    context.register('multiple1.string', multipleStringValue1)
    context.register('multiple2.string', multipleStringValue2)
    context.bootstrap(true)
      .then(function(context) {
        expect(context.instances['multiple1'].string).toEqual(multipleStringValue1)
        expect(context.instances['multiple2'].string).toEqual(multipleStringValue2)
        done()
      }, 
      errorHandler(done))
  })
  
  it('instantiates objects on demand when lazily bootstrapped', function(done) {
    context.bootstrap(false)
      .then(function(context) {
        context.getInstance('my.service', function(err, service) {
          if (err) fail(err)
          else {
            expect(service).toBeDefined()
            expect(service.model).toBeDefined()
          }
          done()
        })
      },
      errorHandler(done))
  })
  
  it('handles arbitrary Javascript (non-Node modules)', function(done) {
    context.bootstrap(true)
      .then(function(context) {
        expect(context.instances['my.non.module']).toBeDefined()
        expect(context.instances['my.non.module'].string).toEqual(nonModuleStringValue)
        done()
      }, 
      errorHandler(done))
  })
  
  it('injects arbitrary strings into instances', function(done) {
    context.bootstrap(true)
      .then(function(context) {
        expect(context.instances['my.model'].string).toEqual(modelStringValue)
        done()
      }, 
      errorHandler(done))
  })
  
  it('creates instances with undefined dependencies using null', function(done) {
    context.bootstrap(true)
      .then(function(context) {
        expect(context.instances['my.service'].string).toBeNull()
        done()
      }, 
      errorHandler(done))
  })
  
  it('resolves transitive dependencies between instances', function(done) {
    context.bootstrap(true)
      .then(function(context) {
        var service = context.instances['my.service']
        expect(service.model).toBeDefined()
        expect(service.model.connection).toEqual('Connection[' + dbUri + ']')
        done()
      }, 
      errorHandler(done))
  })
  
  it('exposes an API that uses callbacks rather than Promises if a callback is provided', function(done) {
    context.bootstrap(false).
      then(function(context) {
        context.getInstance('my.service', function(err, service) {
          if (err) fail(err)
          else expect(service.model).toBeDefined()
          done()
        })
      }, 
      errorHandler(done))
  })
  
  it('creates new instances of prototype-scoped providers', function(done) {
    context.bootstrap(true)
      .then(function(context) {
        return Promise.all(
            [Promise.resolve(context.instances['my.model']), 
             context.getInstance('my.model'),
             context.getInstance('my.model')]
        )
      })
      .then(function(models) {
        var model0 = models[0]
        var model1 = models[1]
        var model2 = models[1]
        var newStringValue = 'newString'
        model0.string = newStringValue
        expect(model0.string).toEqual(newStringValue)
        expect(model1.string).toEqual(modelStringValue)
        expect(model2.string).toEqual(modelStringValue)
        done()
      }, 
      errorHandler(done))
  })
  
  it('returns the same instance of singleton-scoped providers', function(done) {
    context.bootstrap(true)
      .then(function(context) {
        return Promise.all(
            [Promise.resolve(context.instances['my.service']), 
             context.getInstance('my.service'),
             context.getInstance('my.service')]
        )
      })
      .then(function(services) {
        var service0 = services[0]
        var service1 = services[1]
        var service2 = services[2]
        var newStringValue = 'newString'
        service0.string = newStringValue
        expect(service0.string).toEqual(newStringValue)
        expect(service1.string).toEqual(newStringValue)
        expect(service2.string).toEqual(newStringValue)
        done()
      }, 
      errorHandler(done))
  })
  
  it('can fetch or create multiple new instances in one call', function(done) {
    context.bootstrap(true)
      .then(function(context) {
        return context.getInstances(['my.model', 'my.model', 'my.service'])
      })
      .then(function(instances) {
        var models = instances['my.model']
        expect(models.length).toEqual(2)
        expect(models[0].string).toEqual(modelStringValue)
        var service = instances['my.service']
        expect(service.model).toBeDefined
        models[0].string = "newModelValue"
        expect(models[1].string).not.toEqual(models[0].string)
        expect(service.model.string).not.toEqual(models[0].string)
        done()
      }, 
      errorHandler(done))
  })
  
  it('accepts abbreviated Promise annotations', function(done) {
    context.bootstrap(true)
      .then(function(context) {
        expect(context.instances['abbreviated1']).toBeDefined()
        expect(context.instances['abbreviated2']).toBeDefined()
        done()
    }, 
    errorHandler(done))
  })
  
  it('accepts constructors that (implicitly) return this AND that (explicitly) return something other else', function(done) {
    context.bootstrap(true)
      .then(function(context) {
        //expect(context.instances['constructed'].name).toEqual('constructed')
        expect(context.instances['returned'].name).toEqual('returned')
        done()
    }, 
    errorHandler(done))
  })
  
  it('names modules without @Provides annotations', function(done) {
    context.bootstrap(true)
      .then(function(context) {
        expect(context.instances['provider1.Provider1']).toBeDefined();
        expect(context.instances['sub.provider2.Provider2']).toBeDefined();
        done()
    }, 
    errorHandler(done))
  })
  
  afterEach(function(done) {
    context = undefined
    done()
  })
  
})
  

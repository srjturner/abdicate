Dependency-injection with the following objectives:

* Lightweight - no imposition of frameworks besides the DI service itself
* Minimal impact on your coding style - all module configuration can be done via annotations.
* Support for explicit registration to allow 3rd-party code or where runtime logic is required.
* Support for constructor-functions, and asynchronous [Promise](https://www.promisejs.org/) and Callback-style factory methods.
* Support for both Promise and Callback styles in the external API.
* Work seamlessly alongside standard Node requires() declarations.


## What problem does this solve?

* Node applications are composed of modules.
* Modules export functions.
* Modules consume the functions of other modules via NPM require().

This much we know already. However, it gets tricky when the following holds:

* A function exported by some module is a constructor or a factory method. In other words, it produces objects.
* The objects produced by the function are required by the functions of other modules.

So - how do we intervene between Module A exporting a constructor/factory function and Module B consuming the instantiated object, so that the consumer is not responsible for the instantiation?

## Concepts

* Some function *provides* an object or value. 
* The function may be a (synchronous) constructor, or it may be an asynchronous "factory" (either *promise* or *callback*).
* The objects produced by functions have a *scope*: either *singleton* (global instance) or *prototype* (a new instance every time).
* Some other function *requires* some objects or values but does not know how to instantiate them.
* The *context* wires up the providers to the requirers.
* Functions can both *require* and *provide*.

That's all there is to it.

### Example

A Mongoose model requires a database connection which requires a configuration loaded from a file which depends upon the NODE_ENV. In the standard Node way this probably means that the model asks some database module for a connection and the database module asks a config module for config and the config asks the process for the NODE_ENV and reads the file. This creates a chain of dependencies, which limits the way that each module can be reused, and makes it hard to test a module in isolation.

The Abdicate approach to solving that problem is standard [Dependency Injection](https://en.wikipedia.org/wiki/Dependency_injection). It looks like this:

_Configuration:_

    /**
     * @Provides 'config'
     * @Requires 'environment'
     */
    module.exports = function(env, callback) {
      if (env == 'production') return require('./prod_config.js')
      else return require('./dev_config.js')
    }

_Database:_

    var mongoose = require('mongoose')
    /**
     * @Provides 'db.connection' async='callback'
     * @Requires 'config'
     */
    module.exports = function(config, callback) {
      var uri = config.db.uri
      mongoose.connect(uri, function (err) {
        callback(err, mongoose.connection)
      })
    }

_Model:_

    var mongoose = require('mongoose')
    /**
     * @Provides 'user.model'
     * @Requires 'db.connection'
     */
    module.exports = function(connection) {
      var schema = new mongoose.Schema({
        name: String,
        passwordHash: String
      })
      return connection.model('users', schema)
    }

_App:_

    // Require Abdicate itself
    var Context = require('abdicate')
    
    // Create the DI Context, supplying the base directories to scan for annotated functions:
    var rootpath = path.join(__dirname, 'src')
    var context = new Context([rootpath])
    
    // Explicitly register any functions that cannot be discovered by scanning the file-system:
    context.register('environment', process.env.NODE_ENV || 'development')
    
    // Bootstrap the DI Context (Promise-style API) with eager-instantiation = true
    context.bootstrap(true).then(function(context) {  
    
        // Reference any eagerly instantiated objects, as necessary
        var User = context.instances['user.model']
        ...
    }

## Annotation Reference

### @Requires

The @Requires annotation lists the _logical_ names of the values that will become the parameters to your function. These names can be anything as long as they correspond to objects that can be provided by the Context at runtime. That is, they must match names implicitly specified in @Provides annotations, or explicitly specified via Context#register().

The value can be a simple string, for a single dependency:

    /**
     * @Requires 'my.foo'
     */ 
    module.exports.singledependency = function(foo) {  
      ...  
    }  

or for many dependencies it must be an array of strings:

    /**
     * @Requires ['my.foo', 'my.bar']
     */ 
    module.exports.multipledependencies = function(foo, bar) {  
      ...  
    }  
    
### @Provides

The @Provides annotation defines a provider of objects within the Context. It has 3 attributes:

__name__      The logical name of the objects provided by the function. __Note__: the prefix "name=" is optional, it is valid to
              simply use ```@Provides 'foo'``` rather than ```@Provides name='foo'```.

__scope__     The scope of the objects - one of 'singleton' (the default) or 'prototype'.

__async__     If undefined or set to false, indicates a synchronous constructor function. If set to 'promise' indicates that the function returns a Promise. If set to 'callback' indicates that the function accepts a Node-style final parameter which is a callback function.

Note: although all synchronous functions are invoked as constructors (i.e. ```new Foo(..)``` ) they are free to return something other than ```this```.

    /**
     * @Provides 'random.string' scope='prototype' async='promise'
     */
    module.exports.randomString = function() { 
      return Promise.resolve(Math.random().toString(36).substring(7));
    }

## API Reference

### new Context(filepaths)

Construct a new DI context. 

__filepaths__    An array of absolute paths which indicate the directories containing the modules to scan for annotated functions.

### Context Properties

__instances__  A Map of names to objects which is populated when bootstrap(true) is called. Before bootstrap() is called or if its 'eager' parameter is set to false, instances will be empty. Note: if using scope=prototype, you should use Context#getInstance(name) to ensure that each instance was newly-created. Context#getInstance(name) on a singleton-scoped object is essentially the same as Context#instances(name), but works lazily - i.e. if no instance yet exists because bootstrapping was not eager, getInstance() will create one and cache it.

### Context Prototype Methods

These are invoked on an instance of Context.

#### Context#register(name, factoryMethodOrInstance, forceIntance, scope, async, dependencies) 

Explicitly register an instance (or a function to create one) with this Context

__name__                      The logical name of the object  
__factoryMethodOrInstance__   The factory method to produce instances, or else a literal instance   
__forceIntance__              [Optional, default = false] Treat factoryMethodOrInstance as an instance even if ```factoryMethodOrInstance instanceof Function == true```  
__scope__                     [Optional, default = 'singleton'] The scope ('prototype' or 'singleton') of the object  
__async__                     [Optional, default = false] False (for synchronous constructors), 'promise' or 'callback'  
__dependencies__              [Optional, default = None] An array of other logical names that the factory method requires when called.

#### Context#bootstrap(eager, callback)

Scans the 'filepaths' and register any annotated functions into the Context. If eager=true then this also populates Context#instances. In any case, this will asynchronously return itself either via the Callback (if provided) or else as a Promise. 

__eager__                      When true causes this to call Context#populate().  
__callback__                   [optional] callback for non-Promise based invocation. 

#### Context#getInstance(name, callback) 

Get the object instance corresponding to the logical name. This will return a Promise if no callback is supplied, otherwise it will invoke the callback in the standard Node (err, result) style. The instance will be created new if it's scope = "prototype" otherwise will return the same instance each time (scope = 'singleton'). Invokes the callback (if supplied) with the instance or else returns a Promise for the instance.

__name__        The logical name (within this context) of the instance to get  
__callback__    [Optional] The callback for non-Promise style invocation. 
 
#### Context#getInstances(names, callback) 

Get a (sub)set of objects in this context. Any that are scope='prototype' will be created afresh. If the same name is provided more than once then the name will be mapped to an array of instances. Invokes the callback (if supplied) with the result, or else returns a Promise for that result.

__names__       The logical names (within this context) of the instances to get  
__callback__    [Optional] The callback for non-Promise based invocation. 
 

## FAQ

**Can I have circular references (A requires B requires C requires A)?** No. This is not a limitation of Abdicate, it's a limitation of logic.   
**Can I annotate multiple functions in one module?** Yes, absolutely.  
**Can I use 3rd-party modules with Abdicate?** Yes, but since these will not be annotated, you will need to register them expicitly with context.register(name, instance)

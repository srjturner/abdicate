Dependency-injection with the following objectives:

* Lightweight - no imposition of frameworks besides the DI service itself
* Minimal impact on your coding style - all module configuration can be done via annotations.
* Support for explicit registration to allow 3rd-party code or where runtime logic is required.
* Support for constructor-functions, and asynchronous Promise and callback-style factory methods.
* Support for both Promise and Callback styles in the external API.
* Work seamlessly alongside standard Node requires() declarations.


## What problem does this solve?

* Node applications are composed of modules.
* Modules export functions.
* Modules consume the functions of other modules via NPM require().

This much we know already. However, it gets tricky when the following holds:

* The function of a module is a constructor or a factory method.
* The Objects instantiated by the module are required by other modules.

How do we intervene between module A exporting a constructor/factory function and module B consuming the instantiated Object, so that the consumer is not responsible for the instantiation?

## Concepts

* Some function *provides* an Object or value. 
* The function may be a constructor, or it may be an asynchronous "factory" (either *promise* or *callback*).
* The objects produced by functions have a scope: either *singleton* (global instance) or *prototype* (a new instance each time).
* Some other function *requires* some Objects or values but does not know how to instantiate them.
* The *context* wires up the providers to the requirers.
* Functions can both *require* and *provide*.

That's all there is to it.

### Example

A Mongoose model requires a database connection which requires a configuration loaded from a file which depends upon the NODE_ENV. In the traditional Node way that means that the model asks some database module for a connection and the database module asks a config module for config and the config asks the environment for the NODE_ENV and reads the file. This creates a chain of dependencies, which limits the way that each module can be reused, and makes it hard to test a module in isolation.

_Configuration:_
```
/**
 * @Provides name='config'
 * @Requires ['environment']
 */
module.exports = function(env, callback) {
  if (env == 'production') return require('./prod_config.js')
  else return require('./dev_config.js')
}

```

_Database:_
```
var mongoose = require('mongoose')
/**
 * @Provides name='db.connection' async='callback'
 * @Requires ['config']
 */
module.exports = function(config, callback) {
  var uri = config.db.uri
  mongoose.connect(uri, function (err) {
    callback(err, mongoose.connection)
  })
}
```

_Model:_
```
var mongoose = require('mongoose')
/**
 * @Provides name='user.model'
 * @Requires ['db.connection']
 */
module.exports = function(connection) {
  var schema = new mongoose.Schema({
    name: String,
    passwordHash: String
  })
  return connection.model('users', schema)
}
```

_App:_
```
// Require Abdicate itself
var Context = require('abdicate')

// Create the DI Context, supplying the base directories to autowire:
var rootpath = path.join(__dirname, 'src')
var context = new Context([rootpath])

// Explicitly register any factories that cannot be autowired:
context.register('environment', process.env.NODE_ENV || 'development')

// Bootstrap the DI Context (Promise-style API) with eager-instantiation = true
context.bootstrap(true).then(function(context) {

  // Reference any eagerly instantiated Objects, as necessary
  var User = context.instances['user.model']
  ...
}
```





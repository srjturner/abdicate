/**
 * @Requires 'db.config'
 * @Provides 'my.connection' async='callback'
 */
var connect = function(config, callback) {
  wait(100) // fake creating a connection to a DB
  callback(null, "Connection[" + config.uri + "]")
}

var wait = function(ms) {
  var start = +(new Date())
  while (new Date() - start < ms) {}
}

module.exports = connect

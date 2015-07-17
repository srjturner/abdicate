/**
 * @Requires ['db.uri']
 * @Provides name='my.connection' async='callback'
 */
var connect = function(options, callback) {
  wait(100) // fake creating a connection to a DB
  callback(null, "Connection[" + options.uri + "]")
}

var wait = function(ms) {
  var start = +(new Date())
  while (new Date() - start < ms) {}
}

module.exports = connect

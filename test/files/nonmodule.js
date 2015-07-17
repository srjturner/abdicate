/**
 * @Requires ['non.module.string']
 * @Provides name='my.non.module'
 */
var MyNonModule = function(str, connection) {
  this.string = str
  this.connection = connection
}

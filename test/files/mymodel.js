/**
 * @Requires ['model.string', 'my.connection']
 * @Provides name='my.model' scope='prototype'
 */
exports.MyModel = function(str, connection) {
  this.string = str
  this.connection = connection
}


/**
 * @Requires ['my.model', 'my.service.string']
 * @Provides name='my.service'
 */
var MyService = function(mymodel, somestring) {
  this.model = mymodel
  this.string = somestring
}

module.exports = MyService
/**
 * @Requires 'multiple1.string'
 * @Provides name='multiple1'
 */
var Multiples1 = function(str) {
  this.string = str
}

/**
 * @Requires ['multiple2.string']
 * @Provides name='multiple2'
 */
var Multiples2 = function(str) {
  this.string = str
}

module.exports.Multiples1 = Multiples1

module.exports.Multiples2 = Multiples2
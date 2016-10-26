/**
 * @Provides 'constructed'
 */
exports.constructed = function() {
  this.name = 'constructed'
}

/**
 * @Provides 'returned'
 */
exports.returned = function() {
  this.name = 'constructed'
  return {name: 'returned'}
}

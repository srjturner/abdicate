/**
 * Example:
 * "Requires ['db.connection', 'config']"
 */
module.exports = function(annotation) {

  this.annotation = 'Requires'
  this.dependencies = [].concat(eval(annotation))

}
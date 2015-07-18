/**
 * Example:
 * "Requires ['db.connection', 'config']"
 */
module.exports = function(path, target, annotation) {

  this.annotation = 'Requires'
  this.value = [].concat(eval(annotation))
  this.target = target

}
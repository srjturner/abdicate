/**
 * Annotation wrapper to parse function annotations like:
 * "Requires 'foo'
 * or 
 * "Requires ['db.connection', 'config']"
 */
module.exports = function(annotation) {

  this.dependencies = [].concat(eval(annotation))

}
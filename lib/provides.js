/**
 * Example:
 * "@Provides name='db.connection' async='callback'"
 */
module.exports = function(path, target, annotation) {

  annotation = "{" + annotation.replace(' ', ', ').replace(/=/g, ':') + "}"
  var expr = "(" + annotation + ")"
  var evaluated = eval(expr)
  this.annotation = 'Provides'
  this.name = evaluated.name
  this.scope = evaluated.scope || 'singleton'
  this.async = evaluated.async || false
  this.target = target
 
}
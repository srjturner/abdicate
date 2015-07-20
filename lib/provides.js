/**
 * Example:
 * "@Provides name='db.connection' async='callback'"
 */
module.exports = function(annotation) {

  // Syntactic sugar: accept "@Provides 'foo'" as well as "@Provides name='foo'"
  if (annotation.indexOf('\'') == 0 && annotation.indexOf('name') == -1) {
    annotation = 'name=' + annotation
  }
  // Turn the annotation into an Object literal
  annotation = "{" + annotation.replace(' ', ', ').replace(/=/g, ':') + "}"
  // Make the expression eval-able by enclosing 
  var expr = "(" + annotation + ")"
  // Evaluate
  var evaluated = eval(expr)
  this.annotation = 'Provides'
  this.name = evaluated.name
  this.scope = evaluated.scope || 'singleton'
  this.async = evaluated.async || false
 
}
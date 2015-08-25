/**
 * Annotation wrapper to parse function annotations like:
 * "@Provides 'db.connection'"
 * or
 * "@Provides name='db.connection'"
 * or
 * "@Provides 'db.connection' async='callback' scope='prototype'"
 * 
 * The "name" it the logical name of the objects provided by the function. Note: the 
 * prefix "name=" is optional, it is valid to simply use @Provides 'foo' rather than 
 * @Provides name='foo'. The "scope" defines the scope of the objects produced by the 
 * function - one of 'singleton' (the default) or 'prototype'. The "async" attribute, 
 * if undefined or set to false indicates a synchronous constructor function. If set 
 * to 'promise' it indicates that the function returns a Promise. If set to 'callback' 
 * it indicates that the function accepts a Node-style final parameter which is a 
 * callback function.
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
  this.name = evaluated.name
  this.scope = evaluated.scope || 'singleton'
  this.async = evaluated.async || false
 
}
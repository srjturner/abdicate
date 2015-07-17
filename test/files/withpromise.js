/**
 * @Provides name='withpromise' async='promise'
 */
var WithPromise = function(str) {
  this.string = str
  return Promise.resolve(this)
}

module.exports = WithPromise
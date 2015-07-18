/**
 * @Provides 'abbreviated1'
 */
exports.AbbreviatedProvides = function() {}

/**
 * @Provides 'abbreviated2' async='promise'
 */
exports.AbbreviatedProvidesWIthPromise = function() {
  return Promise.resolve(this)
}

/**
 * Abstract Cache class
 * @constructor
 * @abstract
 */
function Cache() {
}

/**
 * Get a single cached item
 * If the entry is not found, reject
 * @param {string} key
 * @return {Promise}
 */
Cache.prototype.get = function (key) {
    return Promise.reject('Cache.get() must be implemented');
};

/**
 * Store a single cached item (overwrites existing)
 * @param {string} key
 * @param {*} value
 * @return {Promise}
 */
Cache.prototype.put = function (key, value) {
    return Promise.reject('Cache.put() must be implemented');
};

/**
 * Remove a single cached item
 * @param {string} key
 * @return {Promise}
 */
Cache.prototype.remove = function (key) {
    return Promise.reject('Cache.remove() must be implemented');
};

module.exports.Cache = Cache;

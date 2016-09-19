var Promise = require('promise'),
    util = require('util'),
    Cache = require('./cache').Cache;

/**
 * Cache implementation that stores entries in an object in memory (not efficient for large caches)
 *
 * @extends Cache
 *
 * @param {object} [options] Options
 * @param {number} [options.expireAfterSeconds=300] Expiration time in seconds (if undefined, entries won't expire)
 * @param {winston~Logger} [options.logger] Logger
 *
 * @example
 * var agent = new PolicyAgent({
 *   cache: new SimpleCache({expireAfterSeconds: 600}) // cached entries expire after 10 minutes
 *   ...
 * })
 *
 * @constructor
 */
function SimpleCache(options) {
    var self = this;

    options = options || {};

    this.expireAfterSeconds = parseFloat(options.expireAfterSeconds || 0);
    this._keyValueStore = {};

    // periodic cleanup
    if (this.expireAfterSeconds > 0) {
        setInterval(function () {
            Object.keys(self._keyValueStore).forEach(function (key) {
                self.get(key); // get the entry, resulting in a cleanup if it's expired
            });

            if (options.logger) {
                options.logger.info('SimpleCache periodic cleanup after %s seconds', self.expireAfterSeconds);
            }
        }, this.expireAfterSeconds * 1000);
    }
}

util.inherits(SimpleCache, Cache);

/**
 * Get a single cached item
 * If the entry is not found, reject
 * @param {string} key
 * @return {Promise}
 */
SimpleCache.prototype.get = function (key) {
    var entry = this._keyValueStore[key];

    if (!entry)
        return Promise.reject('SimpleCache: entry not found in cache');

    // if the entry has expired, don't return it and delete it
    if (this.expireAfterSeconds && Date.now() > entry.timestamp + this.expireAfterSeconds * 1000) {
        delete this._keyValueStore[key];
        return Promise.reject('SimpleCache: entry expired');
    } else {
        return Promise.resolve(entry.data);
    }
};

/**
 * Store a single cached item (overwrites existing)
 * @param {string} key
 * @param {*} value
 */
SimpleCache.prototype.put = function (key, value) {
    this._keyValueStore[key] = {
        timestamp: Date.now(),
        data: value
    };
    return Promise.resolve();
};

/**
 * Remove a single cached item
 * @param {string} key
 * @return {Promise}
 */
SimpleCache.prototype.remove = function (key) {
    delete this._keyValueStore[key];
    return Promise.resolve();
};

module.exports.SimpleCache = SimpleCache;

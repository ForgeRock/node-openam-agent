var Promise = require('promise'),
    util = require('util'),
    Cache = require('./cache').Cache;

/**
 * Cache implementation for memcached
 *
 * @extends Cache
 *
 * @param {object} [options] Options
 * @param {string} [options.url=http://localhost/11211] memcached URL
 * @param {number} [options.expireAfterSeconds=60] Expiration time in seconds
 *
 * @example
 * var memcachedCache = new MemcachedCache({
 *   url: 'cache.example.com:11211',
 *   expireAfterSeconds: 600
 * });
 *
 * @constructor
 */
function MemcachedCache(options) {
    options = options || {};

    var memjs = require('memjs');

    this.client = memjs.Client.create(options.url || 'http://localhost/11211');
    this.expireAfterSeconds = options.expireAfterSeconds || 60;
}

util.inherits(MemcachedCache, Cache);

/**
 * Get a single cached item
 * If the entry is not found, reject
 *
 * @param {string} key
 *
 * @return {Promise}
 *
 * @example
 * memcachedCache.get('foo').then(function (cached) {
 *   console.log(cached);
 * }).catch(function (err) {
 *   console.error(err);
 * });
 */
MemcachedCache.prototype.get = function (key) {
    var self = this;

    return new Promise(function (resolve, reject) {
        self.client.get(key, function (err, res) {
            if (err) {
                reject(err);
            } else if (!res) {
                reject('MemcachedCache: entry not found in cache');
            } else {
                try {
                    resolve(JSON.parse(res));
                } catch (err) {
                    reject(err);
                }
            }
        });
    });
};

/**
 * Store a single cached item (overwrites existing)
 *
 * @param {string} key
 *
 * @param {*} value
 *
 * @return {Promise}
 *
 * @example
 * memcachedCache.put('foo', {bar: 'baz'}).then(function () {
 *   console.log('foo saved to cache');
 * }).catch(function (err) {
 *   console.error(err);
 * });
 */
MemcachedCache.prototype.put = function (key, value) {
    var self = this;

    return new Promise(function (resolve, reject) {
        self.client.set(key, JSON.stringify(value), function (err, res) {
            if (err) reject(err);
            resolve(res);
        }, self.expireAfterSeconds);
    });
};

/**
 * Remove a single cached item
 *
 * @param {string} key
 *
 * @return {Promise}
 *
 * @example
 * memcachedCache.remove('foo').then(function () {
 *   console.log('foo removed from cache');
 * }).catch(function (err) {
 *   console.error(err);
 * });
 */
MemcachedCache.prototype.remove = function (key) {
    var self = this;

    return new Promise(function (resolve, reject) {
        self.client.delete(key, function (err, res) {
            if (err) reject(err);
            resolve(res);
        });
    });
};

module.exports.MemcachedCache = MemcachedCache;

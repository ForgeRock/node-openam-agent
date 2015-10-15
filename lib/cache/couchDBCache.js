var Promise = require('promise'),
    util = require('util'),
    Cache = require('./cache').Cache;

/**
 * Cache implementation for CouchDB
 *
 * @extends Cache
 *
 * @param {object} [options] Options
 * @param {string} [options.protocol=http] CouchDB protocol (http|https)
 * @param {string} [options.host=http://localhost] CouchDB host
 * @param {string} [options.port=5984] CouchDB port
 * @param {string} [options.db=openamagent] CouchDB database name
 * @param {object} [options.auth] CouchDB auth credentials
 * @param {string} [options.auth.username] CouchDB user name
 * @param {string} [options.auth.password] CouchDB password
 * @param {number} [options.expireAfterSeconds=60] Expiration time in seconds
 *
 * @example
 * var couchDBCache = new CouchDBCache({
 *   host: 'db.example.com',
 *   port: 5984,
 *   auth: {
 *     username: 'admin',
 *     password: 'secret123'
 *   },
 *   expireAfterSeconds: 600
 * });
 *
 * @constructor
 */
function CouchDBCache(options) {
    var self = this,
        cradle = require('cradle');

    options = options || {};

    this.connection = new cradle.Connection({
        protocol: options.protocol || 'http',
        host: options.host || 'localhost',
        port: options.port || '5984',
        auth: options.auth,
        cache: false,
        raw: false,
        forceSave: true
    });

    this.db = this.connection.database(options.db || 'openamagent');

    this.expireAfterSeconds = options.expireAfterSeconds || 60;

    // create database if it doesn't exist
    this.db.exists(function (err, exists) {
        if (err) throw err;
        if (!exists) {
            self.db.create(function (err) {
                if (err) throw err;
            });
        }
    });
}

util.inherits(CouchDBCache, Cache);

/**
 * Get a single cached item
 * If the entry is not found, reject
 *
 * @param {string} key
 *
 * @return {Promise}
 *
 * @example
 * couchDBCache.get('foo').then(function (cached) {
 *   console.log(cached);
 * }).catch(function (err) {
 *   console.error(err);
 * });
 */
CouchDBCache.prototype.get = function (key) {
    var self = this;

    return Promise.denodeify(this.db.get.bind(this.db))(key).then(function (res) {
        if (!res) {
            throw 'CouchDBCache: entry not found in cache';
        }

        var expires = new Date(res.timestamp);

        if (self.expireAfterSeconds && Date.now() > expires.getTime() + (self.expireAfterSeconds * 1000)) {
            self.remove(key);
            throw 'CouchDBCache: entry expired';
        }

        return res.data;
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
 * couchDBCache.put('foo', {bar: 'baz'}).then(function () {
 *   console.log('foo saved to cache');
 * }).catch(function (err) {
 *   console.error(err);
 * });
 */
CouchDBCache.prototype.put = function (key, value) {
    return Promise.denodeify(this.db.save.bind(this.db))(key, {data: value, timestamp: new Date()});
};

/**
 * Remove a single cached item
 *
 * @param {string} key
 *
 * @return {Promise}
 *
 * @example
 * couchDBCache.remove('foo').then(function () {
 *   console.log('foo removed from cache');
 * }).catch(function (err) {
 *   console.error(err);
 * });
 */
CouchDBCache.prototype.remove = function (key) {
    var self = this;
    return this.get(key).then(function (res) {
        return Promise.denodeify(self.db.remove.bind(self.db))(key, res._rev);
    });
};

module.exports.CouchDBCache = CouchDBCache;

var Promise = require('promise'),
    util = require('util'),
    Cache = require('./cache').Cache;

/**
 * Cache implementation for MongoDB
 *
 * @extends Cache
 *
 * @param {object} [options] Options
 * @param {string} [options.url=http://localhost/openam-agent] MongoDB URL
 * @param {number} [options.expireAfterSeconds=60] Expiration time in seconds
 * @param {string} [options.collectionName=agentcache] MongoDB collection name

 * @example
 * var mongoCache = new MongoCache({
 *   url: 'mongodb://db.example.com/mydb',
 *   expireAfterSeconds: 600,
 *   collectionName: 'sessions'
 * });
 *
 * @constructor
 */

function MongoCache(options) {
    options = options || {};

    var mongodb = require('mongodb'),
        url = options.url || 'http://localhost/openam-agent',
        expireAfterSeconds = options.expireAfterSeconds || 60,
        collectionName = options.collectionName || 'agentcache';
    this.collection = Promise.denodeify(mongodb.MongoClient.connect)(url).then(function (db) {
        var collection = db.collection(collectionName);
        return collection.createIndex('timestamp', {expireAfterSeconds: expireAfterSeconds}).then(function () {
            return collection;
        });
    });
}

util.inherits(MongoCache, Cache);

/**
 * Get a single cached item
 * If the entry is not found, reject
 *
 * @param {string} key
 *
 * @return {Promise}
 *
 * @example
 * mongoCache.get('foo').then(function (cached) {
 *   console.log(cached);
 * }).catch(function (err) {
 *   console.error(err);
 * });
 */
MongoCache.prototype.get = function (key) {
    return this.collection
        .then(function (collection) {
            return collection.find({_id: key}).limit(1).next();
        })
        .then(function (res) {
            if (!res) throw ('MongoCache: entry not found in cache');
            return res.data;
        });
};

/**
 * Store a single cached item (overwrites existing)
 *
 * @param {string} key
 * @param {*} value
 * @return {Promise}
 *
 * @example
 * mongoCache.put('foo', {bar: 'baz'}).then(function () {
 *   console.log('foo saved to cache');
 * }).catch(function (err) {
 *   console.error(err);
 * });
 */
MongoCache.prototype.put = function (key, value) {
    return this.collection.then(function (collection) {
        //console.log(key, value, collection);
        return collection.findOneAndReplace({
            _id: key
        }, {
            _id: key,
            timestamp: new Date(),
            data: value
        }, {
            upsert: true
        });
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
 * mongoCache.remove('foo').then(function () {
 *   console.log('foo removed from cache');
 * }).catch(function (err) {
 *   console.error(err);
 * });
 */
MongoCache.prototype.remove = function (key) {
    return this.collection.then(function (collection) {
        return collection.findOneAndDelete({_id: key});
    });
};

/**
 * Closes the database connection
 *
 * @return {Promise}
 *
 * @example
 * mongoCache.close().then(function () {
 *   console.log('cache closed');
 * });
 */
MongoCache.prototype.close = function () {
    return this.db.close();
};

module.exports.MongoCache = MongoCache;

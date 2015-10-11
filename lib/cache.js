var Promise = require('promise'),
    util = require('util'),
    mongodb = require('mongodb'),
    memjs = require('memjs'),
    cradle = require('cradle');

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


/**
 * Cache implementation that stores entries in an object in memory (not efficient for large caches)
 *
 * @extends Cache
 *
 * @param {object} [options] Options
 * @param {number} [options.expireAfterSeconds] Expiration time in seconds (if undefined, entries won't expire)
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
    this.expireAfterSeconds = options.expireAfterSeconds;
    this._keyValueStore = {};
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


/**
 * Cache implementation for MongoDB
 *
 * @extends Cache
 *
 * @param {object} [options] Options
 * @param {string} [options.url=http://localhost/openam-agent] MongoDB URL
 * @param {number} [options.expireAfterSeconds=60] Expiration time in seconds
 * @param {string} [options.collectionName=agentcache] MongoDB collection name

 * @todo  move to separate module

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

    var url = options.url || 'http://localhost/openam-agent',
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


/**
 * Cache implementation for memcached
 *
 * @extends Cache
 *
 * @param {object} [options] Options
 * @param {string} [options.url=http://localhost/11211] memcached URL
 * @param {number} [options.expireAfterSeconds=60] Expiration time in seconds
 *
 * @todo  move to separate module
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
 * @todo  move to separate module
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
    var self = this;

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

var Promise = require('promise'),
    mongodb = require('mongodb'),
    memjs = require('memjs');

/**
 * Abstract Cache class
 * @constructor
 */
function Cache() {
}

/**
 * Get a single cached item
 * If the entry is not found, reject
 * @param key {string}
 * @return {Promise}
 */
Cache.prototype.get = function (key) {
    return Promise.reject('Cache.get() must be implemented');
};

/**
 * Store (upsert) a single cached item
 * @param key {string}
 * @param value {string}
 * @return {Promise}
 */
Cache.prototype.put = function (key, value) {
    return Promise.reject('Cache.put() must be implemented');
};

/**
 * Remove a single cached item
 * @param key {string}
 * @return {Promise}
 */
Cache.prototype.remove = function (key) {
    return Promise.reject('Cache.remove() must be implemented');
};


/**
 * Cache implementation that stores entries in an object in memory (not efficient for large caches)
 * @param {number} [options.expireAfterSeconds=60] Expiration time in seconds (set to 0 to never expire)
 * @constructor
 */
function SimpleCache(options) {
    this.expireAfterSeconds = (typeof options.expireAfterSeconds === 'undefined' ? 60 : options.expireAfterSeconds) * 1000;
    this._keyValueStore = {};
}

SimpleCache.prototype.put = function (key, value) {
    this._keyValueStore[key] = {
        timestamp: Date.now(),
        data: value
    };
    return Promise.resolve();
};

SimpleCache.prototype.get = function (key) {
    var entry = this._keyValueStore[key];

    if (!entry)
        return Promise.reject('SimpleCache: entry not found in cache');

    // if the entry has expired, don't return it and delete it
    if (this.expireAfterSeconds && Date.now() > entry.timestamp + this.expireAfterSeconds) {
        delete this._keyValueStore[key];
        return Promise.reject('SimpleCache: entry expired');
    } else {
        return Promise.resolve(entry.data);
    }
};

SimpleCache.prototype.remove = function (key) {
    delete this._keyValueStore[key];
    return Promise.resolve();
};

module.exports.SimpleCache = SimpleCache;


/**
 * Cache implementation for MongoDB
 * @constructor
 * @param {string} [options.url=http://localhost/openam-agent] MongoDB URL
 * @param {number} [options.expireAfterSeconds=60] Expiration time in seconds
 * @param {string} [options.collectionName=agentcache] MongoDB collection name
 * @todo  move to separate module
 */

function MongoCache(options) {
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

MongoCache.prototype.remove = function (key) {
    return this.collection.then(function (collection) {
        return collection.findOneAndDelete({_id: key});
    });
};

MongoCache.prototype.close = function () {
    return this.db.close();
};

module.exports.MongoCache = MongoCache;


/**
 * Cache implementation for memcached
 * @constructor
 * @param {string} [options.url=http://localhost/11211] memcached URL
 * @param {number} [options.expireAfterSeconds=60] Expiration time in seconds
 * @todo  move to separate module
 */
function MemcachedCache(options) {
    this.client = memjs.Client.create(options.url || 'http://localhost/11211');
    this.expireAfterSeconds = options.expireAfterSeconds || 60;
}

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

MemcachedCache.prototype.put = function (key, value) {
    var self = this;

    return new Promise(function (resolve, reject) {
        self.client.set(key, JSON.stringify(value), function (err, res) {
            if (err) reject(err);
            resolve(res);
        }, self.expireAfterSeconds);
    });
};

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

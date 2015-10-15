var Cache = require('./cache'),
    SimpleCache = require('./simpleCache').SimpleCache,
    MongoCache = require('./mongoCache').MongoCache,
    MemcachedCache = require('./memcachedCache').MemcachedCache,
    CouchDBCache = require('./couchDBCache').CouchDBCache;

module.exports.Cache = Cache;

module.exports.SimpleCache = SimpleCache;
module.exports.simpleCache = function (options) {
    return new SimpleCache(options);
};

module.exports.MongoCache = MongoCache;
module.exports.mongoCache = function (options) {
    return new MongoCache(options);
};

module.exports.MemcachedCache = MongoCache;
module.exports.memcachedCache = function (options) {
    return new MemcachedCache(options);
};

module.exports.CouchDBCache = CouchDBCache;
module.exports.couchDBCache = function (options) {
    return new CouchDBCache(options);
};

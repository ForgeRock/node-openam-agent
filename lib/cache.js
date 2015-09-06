/**
 * Cache class for storing and automatically invalidating cached data
 * @param ttl Number Time to live (seconds)
 * @constructor
 */
function Cache(ttl) {
    this.ttl = isNaN(parseInt(ttl)) ? 0 : Math.abs(parseInt(ttl)) * 1000;
    this._keyValueStore = {};
}

Cache.prototype.put = function (key, value) {
    this._keyValueStore[key] = {
        timestamp: Date.now(),
        value: value
    };
};

Cache.prototype.get = function (key) {
    var data = this._keyValueStore[key];
    
    if (!data)
        return null;

    // if the entry has expired, don't return it and delete it
    if (this.ttl && Date.now() > data.timestamp + this.ttl) {
        delete this._keyValueStore[key];
    } else {
        return data.value;
    }
};

Cache.prototype.remove = function (key) {
    delete this._keyValueStore[key];
};

Cache.prototype.search = function (filterFunc) {
    return Object.keys(cache).map(function (key) {
        return {key: key, data: cache[key]};
    }).filter(filterFunc);
};

module.exports.Cache = Cache;

var should = require('should'),
    sinon = require('sinon'),
    Promise = require('promise'),
    cache = require('../lib/cache');


describe('SimpleCache', function () {
    it('should return the stored value if it has not expired yet', function () {
        var simpleCache = new cache.SimpleCache(0.2);
        return simpleCache
            .put('foo', 'bar')
            .then(function () {
                return new Promise (function (resolve) {
                    setTimeout(resolve, 100);
                });
            })
            .then(function () {
                return simpleCache.get('foo');
            })
            .then(function (cached) {
                cached.should.be.equal('bar');
            });

    });

    it('should not return the stored value if it has expired', function () {
        var simpleCache = new cache.SimpleCache(1);
        return simpleCache
            .put('foo', 'bar')
            .then(function () {
                return new Promise (function (resolve) {
                    setTimeout(resolve, 1300);
                });
            })
            .then(function () {
                return simpleCache.get('foo');
            })
            .then(function (cached) {
                should(cached).not.be.equal('bar');
            })
            .catch(function (err) {
                should(err).not.be.equal(undefined);
                should(err).not.be.equal(null);
            });

    });
});

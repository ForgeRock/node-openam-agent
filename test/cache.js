var should = require('should'),
    sinon = require('sinon'),
    Promise = require('promise'),
    cache = require('../lib/cache'),
    logger = require('../lib/logger');


describe('SimpleCache', function () {
    it('should return the stored value if it has not expired yet', function () {
        var simpleCache = new cache.SimpleCache({expireAfterSeconds: 0.2});
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
        var simpleCache = new cache.SimpleCache({expireAfterSeconds: 1});
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

    it('should clean up entries periodically', function (done) {
        var simpleCache = new cache.SimpleCache({expireAfterSeconds: 0.2, logger: logger('error', 'test')});
        simpleCache.put('foo', 'bar');
        setTimeout(function () {
            should(simpleCache._keyValueStore.foo).be.undefined();
            done();
        }, 300);
    });
});

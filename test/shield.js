var assert = require('assert'),
    Promise = require('bluebird'),
    sinon = require('sinon'),
    Promise = require('bluebird'),
    util = require('util'),
    openamAgent = require('..');


var mockAgent = {
    validateSession: function (sessionId) {
        return {
            valid: !!sessionId && sessionId === 'testSession'
        };
    },
    getSessionIdFromRequest: function (req) {
        return Promise.resolve(req.headers.cookie.split('=')[1]);
    },
    serverInfo: util._extend(Promise.resolve(), {domains: ['.example.com']}),
    getLoginUrl: sinon.stub().returns('test-login-url'),
    logger: console
};

console.info = console.silly = function () {
};

describe('CookieShield', function () {
    it('should set params when present', function () {
        var cookieShield = new openamAgent.CookieShield({
            getProfiles: true,
            noRedirect: true
        });
        assert(cookieShield.getProfiles);
        assert(cookieShield.noRedirect);
    });

    describe('.evaluate()', function () {
        it('should call success if the session is valid', function () {
            var cookieShield = new openamAgent.CookieShield(),
                req = {headers: {cookie: 'testCookie=testSession'}},
                res = {};

            return cookieShield.evaluate(req, res, mockAgent).then(function (session) {
                assert.strictEqual(session.key, 'testSession');
            });

        });

        it('should not fail if the session is valid', function () {
            var cookieShield = new openamAgent.CookieShield(),
                req = {headers: {cookie: 'testCookie=testSession'}},
                res = {};

            return cookieShield.evaluate(req, res, mockAgent)
                .then(function () {
                    throw 'should not have succeeded!';
                })
                .catch(function (err) {
                    assert(!!err);
                });
        });

        it('should send a redirect to the proper URL if the session is invalid', function () {
            var cookieShield = new openamAgent.CookieShield(),
                req = {
                    headers: {
                        cookie: 'testCookie=invalidSession',
                        host: 'app.example.com'
                    }
                },
                res = {
                    writeHead: sinon.spy(),
                    end: sinon.spy()
                },
                success = sinon.spy(),
                error = sinon.spy();

            cookieShield.evaluate(req, res, mockAgent).then(success).catch(error);

            return Promise.delay(200).then(function () {
                assert(res.writeHead.called);
                assert.strictEqual(res.writeHead.args[0][0], 302);
                assert.strictEqual(res.writeHead.args[0][1].Location, 'test-login-url');
                assert(res.end.called);
                assert(!success.called);
                assert(!error.called);
            });
        });

        it('should fail with a 401 status if the session is invalid but norRedirect is true', function () {
            var cookieShield = new openamAgent.CookieShield({cookieName: 'testCookie', noRedirect: true}),
                req = {
                    headers: {
                        cookie: 'testCookie=invalidSession'
                    }
                },
                res = {};

            return cookieShield.evaluate(req, res, mockAgent)
                .then(function () {
                    throw 'should not have been called!';
                })
                .catch(function (err) {
                    assert.strictEqual(err.statusCode, 401);
                });
        });

        it('should succeed if the session is invalid but passThrough is true', function () {
            var cookieShield = new openamAgent.CookieShield({cookieName: 'testCookie', passThrough: true}),
                req = {
                    headers: {
                        cookie: 'testCookie=invalidSession'
                    }
                },
                res = {};

            return cookieShield.evaluate(req, res, mockAgent)
                .then(function (session) {
                    assert.deepEqual(session.data, {});
                });
        });
    });
});

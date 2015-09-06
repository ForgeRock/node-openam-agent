var should = require('should'),
    sinon = require('sinon'),
    Promise = require('promise'),
    openamAgent = require('..');


var mockAgent = {
    validateSession: function (sessionId) {
        return {
            valid: !!sessionId && sessionId === 'testSession'
        };
    },
    serverInfo: Promise.resolve(),
    openAMClient: {
        getLoginUrl: sinon.stub().returns('test-login-url')
    }
};

describe('CookieShield', function () {
    it('should set this.agent on init', function () {
        var cookieShield = new openamAgent.CookieShield();
        cookieShield.init(mockAgent);
        cookieShield.agent.should.be.equal(mockAgent);
    });

    it('should set cookieName when present', function () {
        var cookieShield = new openamAgent.CookieShield('testCookie');
        cookieShield.cookieName.should.be.equal('testCookie');
    });

    it('should set params when present', function () {
        var cookieShield = new openamAgent.CookieShield({
            cookieName: 'testCookie',
            noRedirect: true
        });
        cookieShield.cookieName.should.be.equal('testCookie');
        cookieShield.noRedirect.should.be.equal(true);
    });

    describe('.evaluate()', function () {
        it('should call success if the session is valid', function () {
            var cookieShield = new openamAgent.CookieShield('testCookie'),
                success = sinon.spy(),
                fail = sinon.spy(),
                req = {headers: {cookie: 'testCookie=testSession'}};

            cookieShield.init(mockAgent);
            return cookieShield.evaluate(req, success, fail).then(function () {
                success.calledOnce.should.be.equal(true);
            });

        });

        it('should not fail if the session is valid', function () {
            var cookieShield = new openamAgent.CookieShield('testCookie'),
                success = sinon.spy(),
                fail = sinon.spy(),
                req = {headers: {cookie: 'testCookie=testSession'}};

            cookieShield.init(mockAgent);
            return cookieShield.evaluate(req, success, fail).then(function () {
                fail.called.should.be.equal(false);
            });
        });

        it('should send a redirect to the proper URL if the session is invalid', function () {
            var cookieShield = new openamAgent.CookieShield('testCookie'),
                success = sinon.spy(),
                fail = sinon.spy(),
                req = {
                    headers: {
                        testCookie: {cookie: 'testCookie=invalidSession'}
                    },
                    res: {
                        redirect: sinon.spy()
                    }
                };

            cookieShield.init(mockAgent);
            return cookieShield.evaluate(req, success, fail).then(function () {
                req.res.redirect.called.should.be.equal(true);
                req.res.redirect.args[0][0].should.be.equal('test-login-url');
            });
        });

        it('should fail with a 401 status if the session is invalid but norRedirect is true', function () {
            var cookieShield = new openamAgent.CookieShield({cookieName: 'testCookie', noRedirect: true}),
                success = sinon.spy(),
                fail = sinon.spy(),
                req = {
                    headers: {
                        testCookie: {cookie: 'testCookie=invalidSession'}
                    },
                    res: {
                        redirect: sinon.spy()
                    }
                };

            cookieShield.init(mockAgent);
            return cookieShield.evaluate(req, success, fail).then(function () {
                req.res.redirect.called.should.be.false();
                fail.called.should.be.true();
                fail.args[0][0].should.be.equal(401);
            });
        });
    });
});

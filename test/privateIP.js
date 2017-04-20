var fs = require('fs'),
    should = require('should'),
    sinon = require('sinon'),
    request = require('request-promise'),
    openamAgent = require('../lib'),
    PolicyAgent = require('../lib/agent').PolicyAgent,
    SimpleCache = require('openam-agent-cache-simple').SimpleCache;

require('should-sinon');

describe('PolicyAgent', function () {
    var agent, otions, resolve, stubRequest = {};

    beforeEach(function () {
        options = {
            noInit: true,
            logLevel: 'none', // suppress logs for tests
            serverUrl: 'http://openam.example.com:8080/openam',
            serverHost: 'openam.example.com:',
            privateIP: 'https://127.0.0.1:8080/openam'
        };

        // agent instance
        agent = new PolicyAgent(options);

        // spies
        resolve = sinon.spy();

        // stubs
        stubRequest.get = sinon.stub(request, 'get', function () {
            return Promise.resolve();
        });
        stubRequest.post = sinon.stub(request, 'post', function () {
            return Promise.resolve();
        });
    });

    afterEach(function () {
        // restore stubs
        request.get.restore();
        request.post.restore();
    });

    it('should set the options', function () {
        should(agent.options).be.equal(options);
    });

    it('should have a random ID', function () {
        should(agent.id.match(/[a-z0-9]+/i)).not.be.null();
    });

    it('should have an OpenAMClient instance', function () {
        should(agent.openAMClient instanceof openamAgent.OpenAMClient).be.true();
    });

    it('should have a session cache instance', function () {
        should(agent.sessionCache instanceof SimpleCache).be.true();
    });

    describe('serverInfo', function () {
        it('should be a resolved promise', function () {
            should(agent.serverInfo).be.Promise();
            agent.serverInfo.then(resolve);
            return agent.serverInfo.then(function () {
                resolve.should.be.called();
            });
        });
    });

    describe('agentSession', function () {
        it('should be a resolved promise', function () {
            should(agent.agentSession).be.Promise();
            agent.agentSession.then(resolve);
            return agent.agentSession.then(function () {
                resolve.should.be.called();
            });
        });
    });

    it('should remove destroyed sessions on session events', function (done) {
        var sessionData = {foo: 'bar'};

        agent.on('session', function () {
            should(agent.sessionCache._keyValueStore.mock).be.undefined();
            done();
        });

        agent.sessionCache.put('mock', sessionData);
        agent.sessionCache.get('mock').then(function (data) {
            data.should.be.equal(sessionData);
            agent.emit('session', {state: 'destroyed', sid: 'mock'});
        });
    });

    describe('init', function () {
        it('should get the server info', function () {
            agent.init();
            stubRequest.get.should.be.calledWith(options.privateIP + '/json/serverinfo/*');
        });
    });

    describe('.getSessionIdFromLARES()', function () {
        it('should resolve the promise with the session ID if the CDSSO Assertion (LARES) is valid', function () {
            var lares = fs.readFileSync(__dirname + '/resources/validLARES.txt').toString();
            return agent.getSessionIdFromLARES(lares)
                .then(function (sessionId) {
                    should(sessionId).be.equal('foo');
                });
        });
        it('should reject the promise if the CDSSO Assertion (LARES) is invalid', function () {
            var lares = fs.readFileSync(__dirname + '/resources/expiredLARES.txt').toString();

            return agent.getSessionIdFromLARES(lares)
                .then(function (sessionId) {
                    should(sessionId).be.equal(null);
                }).catch(function (err) {
                    should(err).not.be.equal(undefined);
                    should(err).not.be.equal(null);
                });
        });
    });
});

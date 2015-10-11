var fs = require('fs'),
    should = require('should');
PolicyAgent = require('../lib/agent').PolicyAgent;

var agent = new PolicyAgent({noInit: true, logLevel: 'info', serverUrl: 'http://openam.example.com:8080/openam'});

describe('PolicyAgent', function () {
    describe('getSessionIdFromLARES', function () {
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
                }).
                catch(function (err) {
                    should(err).not.be.equal(undefined);
                    should(err).not.be.equal(null);
                });
        });
    });
});







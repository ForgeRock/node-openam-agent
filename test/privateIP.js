var sinon = require('sinon'),
    assert = require('assert'),
    request = require('request-promise'),
    OpenAMClient = require('../lib/openam').OpenAMClient;

describe('PolicyAgent', function () {
    var serverHost, serverUrl, privateIP;

    beforeEach(function () {

        serverUrl = 'http://openam.example.com:8080/openam';
        serverHost = 'openam.example.com';
        privateIP = 'http://127.0.0.1:8080/openam';

        // client instance
        client = new OpenAMClient(serverUrl, serverHost, privateIP);

        // spies
        getRequests = sinon.spy(request, 'get');
        postRequests = sinon.spy(request, 'post');

    });

    afterEach(function () {
        // restore stubs
        getRequests.restore();
        postRequests.restore();
    });

    describe('getServerInfo', function () {
        it('request should have header host value', function () {
            client.getServerInfo();
            assert.equal(request.get.getCall(0).args[1].headers.host, serverHost);
        });
    });
    describe('authenticate', function () {
        it('request should have header host value', function () {
            client.authenticate();
            assert.equal(request.post.getCall(0).args[1].headers.host, serverHost);
        });
    });
    describe('logout', function () {
        it('request should have header host value', function () {
            client.logout('sessionID');
            assert.equal(request.post.getCall(0).args[1].headers.host, serverHost);
        });
    });
    describe('validateSession', function () {
        it('request should have header host value', function () {
            client.validateSession('sessionID');
            assert.equal(request.post.getCall(0).args[1].headers.host, serverHost);
        });
    });
    describe('getPolicyDecision', function () {
        it('request should have header host value', function () {
            client.getPolicyDecision({},'sessionID', 'cookieName');
            assert.equal(request.post.getCall(0).args[1].headers.host, serverHost);
        });
    });
    describe('sessionServiceRequest', function () {
        it('request should have header host value', function () {
            client.sessionServiceRequest();
            assert.equal(request.post.getCall(0).args[1].headers.host, serverHost);
        });
    });
    describe('validateAccessToken', function () {
        it('request should have header host value', function () {
            client.validateAccessToken();
            assert.equal(request.get.getCall(0).args[1].headers.host, serverHost);
        });
    });
    describe('getProfile', function () {
        it('request should have header host value', function () {
            client.getProfile();
            assert.equal(request.get.getCall(0).args[1].headers.host, serverHost);
        });
    });
});

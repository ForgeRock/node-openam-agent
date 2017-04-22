var sinon = require('sinon'),
    assert = require('assert'),
    request = require('request-promise'),
    OpenAMClient = require('../lib/openam').OpenAMClient;

describe('Test with private IP', function () {
    var hostname, serverUrl, privateIP;

    beforeEach(function () {

        serverUrl = 'http://openam.example.com:8080/openam';
        hostname = 'openam.example.com';
        privateIP = '127.0.0.1';

        // client instance
        client = new OpenAMClient(serverUrl, privateIP);

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
        it('request should have private ip in url', function () {
            client.getServerInfo();
            assert.equal(request.get.getCall(0).args[0].includes(privateIP), true);
        });
        it('request should have header host value', function () {
            client.getServerInfo();
            assert.equal(request.get.getCall(0).args[1].headers.host, hostname);
        });
    });
    describe('authenticate', function () {
        it('request should have private ip in url', function () {
            client.authenticate();
            assert.equal(request.post.getCall(0).args[0].includes(privateIP), true);
        });
        it('request should have header host value', function () {
            client.authenticate();
            assert.equal(request.post.getCall(0).args[1].headers.host, hostname);
        });
    });
    describe('logout', function () {
        it('request should have private ip in url', function () {
            client.logout('sessionid');
            assert.equal(request.post.getCall(0).args[0].includes(privateIP), true);
        });
        it('request should have header host value', function () {
            client.logout('sessionid');
            assert.equal(request.post.getCall(0).args[1].headers.host, hostname);
        });
    });
    describe('validateSession', function () {
        it('request should have private ip in url', function () {
            client.validateSession('sessionid');
            assert.equal(request.post.getCall(0).args[0].includes(privateIP), true);
        });
        it('request should have header host value', function () {
            client.validateSession('sessionid');
            assert.equal(request.post.getCall(0).args[1].headers.host, hostname);
        });
    });
    describe('getPolicyDecision', function () {
        it('request should have private ip in url', function () {
            client.getPolicyDecision({}, 'sessionId', 'cookieName');
            assert.equal(request.post.getCall(0).args[0].includes(privateIP), true);
        });
        it('request should have header host value', function () {
            client.getPolicyDecision({}, 'sessionId', 'cookieName');
            assert.equal(request.post.getCall(0).args[1].headers.host, hostname);
        });
    });
    describe('sessionServiceRequest', function () {
        it('request should have private ip in url', function () {
            client.sessionServiceRequest();
            assert.equal(request.post.getCall(0).args[0].includes(privateIP), true);
        });
        it('request should have header host value', function () {
            client.sessionServiceRequest();
            assert.equal(request.post.getCall(0).args[1].headers.host, hostname);
        });
    });
    describe('validateAccessToken', function () {
        it('request should have private ip in url', function () {
            client.validateAccessToken();
            assert.equal(request.get.getCall(0).args[0].includes(privateIP), true);
        });
        it('request should have header host value', function () {
            client.validateAccessToken();
            assert.equal(request.get.getCall(0).args[1].headers.host, hostname);
        });
    });
    describe('getProfile', function () {
        it('request should have private ip in url', function () {
            client.getProfile();
            assert.equal(request.get.getCall(0).args[0].includes(privateIP), true);
        });
        it('request should have header host value', function () {
            client.getProfile();
            assert.equal(request.get.getCall(0).args[1].headers.host, hostname);
        });
    });
});
describe('Test without private IP', function () {
    var hostname, serverUrl;

    beforeEach(function () {

        serverUrl = 'http://openam.example.com:8080/openam';
        hostname = 'openam.example.com';

        // client instance
        client = new OpenAMClient(serverUrl);

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
        it('request should have serverUrl in url', function () {
            client.getServerInfo();
            assert.equal(request.get.getCall(0).args[0].includes(serverUrl), true);
        });
        it('request should have header host value', function () {
            client.getServerInfo();
            assert.equal(request.get.getCall(0).args[1].headers.host, hostname);
        });
    });
    describe('authenticate', function () {
        it('request should have serverUrl in url', function () {
            client.authenticate();
            assert.equal(request.post.getCall(0).args[0].includes(serverUrl), true);
        });
        it('request should have header host value', function () {
            client.authenticate();
            assert.equal(request.post.getCall(0).args[1].headers.host, hostname);
        });
    });
    describe('logout', function () {
        it('request should have serverUrl in url', function () {
            client.logout('sessionid');
            assert.equal(request.post.getCall(0).args[0].includes(serverUrl), true);
        });
        it('request should have header host value', function () {
            client.logout('sessionid');
            assert.equal(request.post.getCall(0).args[1].headers.host, hostname);
        });
    });
    describe('validateSession', function () {
        it('request should have serverUrl in url', function () {
            client.validateSession('sessionid');
            assert.equal(request.post.getCall(0).args[0].includes(serverUrl), true);
        });
        it('request should have header host value', function () {
            client.validateSession('sessionid');
            assert.equal(request.post.getCall(0).args[1].headers.host, hostname);
        });
    });
    describe('getPolicyDecision', function () {
        it('request should have serverUrl in url', function () {
            client.getPolicyDecision({}, 'sessionID', 'cookieName');
            assert.equal(request.post.getCall(0).args[0].includes(serverUrl), true);
        });
        it('request should have header host value', function () {
            client.getPolicyDecision({}, 'sessionID', 'cookieName');
            assert.equal(request.post.getCall(0).args[1].headers.host, hostname);
        });
    });
    describe('sessionServiceRequest', function () {
        it('request should have serverUrl in url', function () {
            client.sessionServiceRequest();
            assert.equal(request.post.getCall(0).args[0].includes(serverUrl), true);
        });
        it('request should have header host value', function () {
            client.sessionServiceRequest();
            assert.equal(request.post.getCall(0).args[1].headers.host, hostname);
        });
    });
    describe('validateAccessToken', function () {
        it('request should have serverUrl in url', function () {
            client.validateAccessToken();
            assert.equal(request.get.getCall(0).args[0].includes(serverUrl), true);
        });
        it('request should have header host value', function () {
            client.validateAccessToken();
            assert.equal(request.get.getCall(0).args[1].headers.host, hostname);
        });
    });
    describe('getProfile', function () {
        it('request should have serverUrl in url', function () {
            client.getProfile();
            assert.equal(request.get.getCall(0).args[0].includes(serverUrl), true);
        });
        it('request should have header host value', function () {
            client.getProfile();
            assert.equal(request.get.getCall(0).args[1].headers.host, hostname);
        });
    });
});
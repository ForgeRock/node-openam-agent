var request = require('request-promise'),
    Promise = require('promise');

function OpenAMClient(serverUrl) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
}

OpenAMClient.prototype.getServerInfo = function () {
    return request.get(this.serverUrl + '/json/serverinfo/*', {json: true});
};

OpenAMClient.prototype.authenticate = function (username, password, realm, service, module, noSession) {
    var authIndexType, authIndexValue;

    if (service) {
        authIndexType = 'service';
        authIndexValue = service;
    }

    if (module) {
        authIndexType = 'module';
        authIndexValue = module;
    }

    return request.post(this.serverUrl + '/json/authenticate', {
        headers: {
            'X-OpenAM-Username': username,
            'X-OpenAM-Password': password
        },
        qs: {
            realm: realm || '/',
            authIndexType: authIndexType,
            authIndexValue: authIndexValue,
            noSession: !!noSession
        },
        json: true
    });
};

OpenAMClient.prototype.logout = function (sessionId) {
    if (!sessionId)
        return Promise.resolve();

    return request.post(this.serverUrl + '/identity/logout', {
        form: {
            subjectid: sessionId
        }
    })
};

OpenAMClient.prototype.validateSession = function (sessionId) {
    if (!sessionId)
        return Promise.resolve({valid: false});

    return request.post(this.serverUrl + '/json/sessions/' + sessionId, {
        qs: {_action: 'validate'},
        headers: {
            'Content-Type': 'application/json'
        },
        json: true
    });
};

OpenAMClient.prototype.getLoginUrl = function (req) {
    return this.serverUrl + '/UI/Login?goto=' +
        encodeURIComponent(req.protocol + '://' + req.get('host') + req.originalUrl);
};

OpenAMClient.prototype.getPolicyDecision = function (params, sessionId, cookieName) {
    var headers = {};
    headers[cookieName] = sessionId;
    return request.post(this.serverUrl + '/json/policies', {
        headers: headers,
        qs: {
            _action: 'evaluate'
        },
        body: params,
        json: true
    });
};

OpenAMClient.prototype.sessionServiceRequest = function (requestSet) {
    return request.post(this.serverUrl + '/sessionservice', {
        headers: {
            'Content-Type': 'text/xml'
        },
        body: requestSet
    });
};

OpenAMClient.prototype.validateAccessToken = function (accessToken, realm) {
    return request.get(this.serverUrl + '/oauth2/tokeninfo', {
        qs: {
            access_token: accessToken,
            realm: realm || '/'
        },
        json: true
    });
};

OpenAMClient.prototype.getProfile = function (userId, realm, sessionId, cookieName) {
    return request.get(this.serverUrl + '/json/users/' + userId, {
        headers: {
            cookie: cookieName + '=' + sessionId
        },
        qs: {
            realm: realm
        },
        json: true
    });
};

module.exports.OpenAMClient = OpenAMClient;

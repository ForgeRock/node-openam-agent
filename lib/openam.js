var request = require('request-promise'),
    url = require('url'),
    shortid = require('shortid'),
    Promise = require('bluebird');

/**
 * This class is used to access OpenAM APIs.
 * @param {string} serverUrl OpenAM server URL
 * @constructor
 */
function OpenAMClient(serverUrl) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
}

/**
 * Gets the results of /json/serverinfo/*
 * @return {Promise} Server info
 */
OpenAMClient.prototype.getServerInfo = function () {
    return request.get(this.serverUrl + '/json/serverinfo/*', {json: true});
};

/**
 * Sends an authentication request to OpenAM. Returns Promise. The module argument overrides service. The default
 * realm is /. If noSession is true, the credentials will be validated but no session will be created.
 * @param {string} username User name
 * @param {string} password Password
 * @param {string} [realm=/] Realm
 * @param {string} [service] Authentication service (i.e. chain)
 * @param {string} [module] Authentication module
 * @param {boolean} [noSession] If true, no session will be created
 * @return {Promise} Authentication response
 */
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

/**
 * Sends a logout request to OpenAM to to destroy the session identified by sessionId
 * @param {string} sessionId OpenAM dession ID
 * @return {Promise} Logout response
 */
OpenAMClient.prototype.logout = function (sessionId) {
    if (!sessionId)
        return Promise.resolve();

    return request.post(this.serverUrl + '/identity/logout', {
        form: {
            subjectid: sessionId
        }
    })
};

/**
 * Validates a given sessionId against OpenAM.
 * @param sessionId
 * @return {Promise} Session validation response
 */
OpenAMClient.prototype.validateSession = function (sessionId) {
    if (!sessionId)
        return Promise.resolve({valid: false});

    return request.post(this.serverUrl + '/json/sessions/' + sessionId, {
        qs: {_action: 'validate'},
        headers: {
            'Content-Type': 'application/json',
            'Accept-API-Version': 'resource=1.1'
        },
        json: true
    });
};

/**
 * Returns an OpenAM login URL with the goto query parameter set to the original URL in req.
 *
 * @param {string} goto Target URL
 * @return {string}
 */
OpenAMClient.prototype.getLoginUrl = function (goto) {
    return this.serverUrl + url.format({
        pathName: '/UI/Login',
        query: {
            goto: goto
        }
    });
};

/**
 * Constructs a CDSSO login URL
 *
 * @param {string} target Target URL
 * @param {string} provider ProviderId (app URL)
 * @return {string}
 */
OpenAMClient.prototype.getCDSSOUrl = function (target, provider) {
    return this.serverUrl + url.format({
            pathname: '/cdcservlet',
            query: {
                TARGET: target,
                RequestID: shortid.generate(),
                MajorVersion: 1,
                MinorVersion: 0,
                ProviderID: provider,
                IssueInstant: (new Date()).toISOString()
            }
        });
};

/**
 * Gets policy decisions from OpenAM for params. params must be a well formatted OpenAM policy request object.
 * It needs a valid sessionId and cookieName in order to make the request. (The user to whom the session belongs needs
 * to have the REST calls for policy evaluation privilege in OpenAM.
 *
 * @param {object} params Policy request params {@see https://backstage.forgerock.com/#!/docs/openam/current/dev-guide#rest-api-authz-policy-decisions}
 * @param {string} sessionId OpenAM session ID
 * @param {string} cookieName OpenAM session cookie name
 * @return {Promise} Policy decision response
 */
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

/**
 * Sends requestSet to the SessionService. requestSet must be a properly formatted XML document.
 *
 * @param {object} requestSet Session service request set
 * @return {Promise} Session service response
 */
OpenAMClient.prototype.sessionServiceRequest = function (requestSet) {
    return request.post(this.serverUrl + '/sessionservice', {
        headers: {
            'Content-Type': 'text/xml'
        },
        body: requestSet
    });
};

/**
 * Validates the OAuth2 access_token in the specified realm.
 *
 * @param {string} accessToken OAuth2 access_token
 * @param {string} [realm=/]
 * @return {Promise} Token info response
 */
OpenAMClient.prototype.validateAccessToken = function (accessToken, realm) {
    //noinspection JSValidateTypes
    return request.get(this.serverUrl + '/oauth2/tokeninfo', {
        qs: {
            access_token: accessToken,
            realm: realm || '/'
        },
        json: true
    });
};

/**
 * Gets a user's profile (requires an agent or admin session).
 * @param {string} userId User name
 * @param {string} realm OpenAM realm name
 * @param {string} sessionId a valid session ID with permissions to read user identities from the specified realm
 * @param {string} cookieName OpenAM session cookie name
 * @return {Promise} User profile response
 */
OpenAMClient.prototype.getProfile = function (userId, realm, sessionId, cookieName) {
    //noinspection JSValidateTypes
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

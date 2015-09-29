var util = require('util'),
    cookie = require('cookie'),
    basicAuth = require('basic-auth'),
    Promise = require('promise');

/**
 * Abstract Shield class
 * @constructor
 */
function Shield() {
}

Shield.prototype.init = function (agent) {
    this.agent = agent;
};

/**
 * Main shield logic; override this method
 * @param req
 * @param success
 * @param fail
 */
Shield.prototype.evaluate = function (req, success, fail) {
    throw new Error('Abstract evaluate method should be overridden.');
};

/**
 * Shield implementation for validating session cookies
 * @constructor
 */
function CookieShield(params) {
    if (util.isObject(params)) {
        this.cookieName = params.cookieName;
        this.noRedirect = params.noRedirect;
        this.getProfiles = params.getProfiles;
    } else {
        this.cookieName = params;
    }
}

util.inherits(CookieShield, Shield);

CookieShield.prototype.evaluate = function (req, success, fail) {
    this.agent.logger.info('CookieShield evaluation for %s', req.originalUrl);

    var self = this, sessionId;

    return this.agent.serverInfo
        .then(function (serverInfo) {
            var cookieName = self.cookieName || serverInfo.cookieName,
                cookies = cookie.parse(req.headers.cookie || '');
            sessionId = cookies[cookieName];
            return self.agent.validateSession(sessionId);
        })
        .then(function (res) {
            if (res.valid) {
                // get profile
                if (!res.dn && self.getProfiles) {
                    return self.agent
                        .getUserProfile(res.uid, res.realm, sessionId)
                        .then(function (userProfile) {
                            return util._extend(res, userProfile);
                        });
                } else {
                    return res;
                }
            } else {
                if (self.noRedirect) {
                    throw {status: 401, message: 'Unauthorized', stack: 'Invalid session'};
                } else {
                    // persist req data for resubmission after successful auth
                    //self.agent.persistRequest(req);

                    // check for redirect loop caused by domain mismatch
                    var domainMatch = false, domains = self.agent.serverInfo.domains;
                    for (var i = 0; i < domains.length; i++) {
                        if (!!~req.get('host').indexOf(domains[i]))
                            domainMatch = true;
                    }
                    if (!domainMatch)
                        throw {status: 400, message: 'Bad Request', stack: 'Domain mismatch'};

                    // redirect to to login
                    req.res.redirect(self.agent.openAMClient.getLoginUrl(req));
                }
            }
        })
        .then(function (res) {
            if (res)
                success(sessionId, res);
        })
        .catch(function (err) {
            fail(err.status || 500, err.message, err.stack);
        });
};

/**
 * Shield implementation for enforcing Oauth2 access_tokens
 *
 * The access_token is expected to be in the Authorization header, i.e.:
 * Authorization: Bearer 0b79bab50daca910b000d4f1a2b675d604257e42
 *
 * @constructor
 */
function OAuth2Shield(realm) {
    this.realm = realm;
}

util.inherits(OAuth2Shield, Shield);

OAuth2Shield.prototype.evaluate = function (req, success, fail) {
    this.agent.logger.info('OAuth2Shield evaluation for %s', req.originalUrl);

    var self = this,
        authorizationHeader = req.headers.authorization || '',
        accessToken = authorizationHeader.replace('Bearer', '').trim();

    if (accessToken.length) {
        this.agent.openAMClient
            .validateAccessToken(accessToken, self.realm)
            .then(function (res) {
                self.agent.logger.silly(res);
                success(accessToken, res);
            })
            .catch(function (err) {
                var status = err.response.statusCode || 500,
                    message = 'Internal server error';

                try {
                    message = JSON.parse(err.response.body).error_description;
                } catch (e) {
                    // body is not json
                }

                fail(status, message);
            });
    } else {
        fail(401, 'Unauthorized', 'Missing OAuth2 Bearer token');
    }
};

/**
 * Shield implementation for enforcing a basic auth header
 *
 * The credentials in the Authorization will be sent to OpenAM. No session will be created.
 *
 * @constructor
 */
function BasicAuthShield(params) {
    if (params) {
        this.realm = params.realm;
        this.service = params.service;
        this.module = params.module;
    }
}

util.inherits(BasicAuthShield, Shield);

BasicAuthShield.prototype.evaluate = function (req, success, fail) {
    this.agent.logger.info('BasicAuthShield evaluation for %s', req.originalUrl);

    var self = this,
        user = basicAuth(req);

    function unauthorized() {
        req.res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
        req.res.status(401).send();
    }

    if (user) {
        this.agent.openAMClient
            .authenticate(user.name, user.pass, self.realm, self.service, self.module, true)
            .then(function (res) {
                //self.agent.logger.info(res);
                success(user.name, user.name);
            })
            .catch(unauthorized);
    } else {
        unauthorized();
    }

};

/**
 * Shield implementation for enforcing policy decisions
 * @constructor
 */
function PolicyShield(applicationName) {
    this.applicationName = applicationName || 'iPlanetAMWebAgentService';
}

util.inherits(PolicyShield, Shield);

PolicyShield.prototype.evaluate = function (req, success, fail) {
    this.agent.logger.info('PolicyShield evaluation for %s', req.originalUrl);

    var self = this,
        cookies = cookie.parse(req.headers.cookie);

    var params = {
        resources: [req.originalUrl],
        application: self.applicationName,
        subject: {
            ssoToken: cookies[self.agent.serverInfo.cookieName]
        }
    };

    self.agent.getPolicyDecision(params)
        .then(function (decision) {
            if (decision) {
                //self.agent.logger.info('Policy decision: %s', decision);
                if (decision[0].actions[req.method]) {
                    req.session.data.policies = decision;
                    success(req.session.key, req.session.data);
                } else {
                    fail(403, 'Forbidden', 'You are not authorized to access this resource.');
                }
            }
        })
        .catch(function (err) {
            fail(500, err.message, err.stack);
        });
};

module.exports.Shield = Shield;
module.exports.CookieShield = CookieShield;
module.exports.BasicAuthShield = BasicAuthShield;
module.exports.OAuth2Shield = OAuth2Shield;
module.exports.PolicyShield = PolicyShield;

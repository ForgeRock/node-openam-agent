var util = require('util'),
    cookie = require('cookie'),
    basicAuth = require('basic-auth'),
    Promise = require('promise');

/**
 * @constructor
 * @abstract
 *
 * @example
 * var util = require('util'),
 * openamAgent = require('openam-agent');
 *
 * function MyShield(options) {
 *    this.options = options;
 * }
 *
 * util.inherits(MyShield, Shield);
 *
 * MyShield.prototype.evaluate = function (req, success, fail) {
 *    var sessionKey, sessionData;
 *    if (this.options.foo) {
 *        // do something
 *        sessionKey = 'foo';
 *        sessionData = 'bar';
 *        success(sessionKey, sessionData);
 *    } else {
 *        // failure
 *        fail(401, 'Unauthorized', 'Missing Foo...');
 *    }
 * };
 *
 * // including it in the express app
 *
 * app.use(agent.shield(new MyShield({foo: 'bar'})));
 */
function Shield() {
}

/**
 * Initializes the shield (used by PolicyAgent#shield()
 *
 * @param {PolicyAgent} agent
 */
Shield.prototype.init = function (agent) {
    this.agent = agent;
};

/**
 * Main shield logic; override this method. Calls fail() or success().
 *
 * @param {Request} req
 * @param {function} success
 * @param {function} fail
 * @return {Promise}
 */
Shield.prototype.evaluate = function (req, success, fail) {
    throw new Error('Abstract evaluate method should be overridden.');
};

/**
 * Shield implementation for validating session cookies. This shield checks if the request contains a session cookie
 * and validates it against OpenAM. The session is cached if notifications are enabled, otherwise it's re-validated for
 * every request.
 *
 * @extends Shield
 *
 * @param {object} [options] Options
 * @param {string} [options.cookieName] overrides the cookie name that was retrieved from OpenAM with
 * {@link PolicyAgent#getServerInfo()}
 * @param {boolean} [options.noRedirect] if {true}, the agent will not redirect to OpenAM's login page for
 * authentication, only return a 401 response
 * @param {boolean} [options.getProfiles=false] If {true}, the agent will fetch and cache the user's profile when
 * validating the session
 * @param {boolean} [options.passThrough=false] If {true}, the shield will not enforce valid sessions. This is useful
 * in conjunction with {getProfiles:true} when a route is public but you want fetch identity information for any logged
 * in users.
 * @param {boolean} [options.cdsso=false] Enable CDSSO mode (you must also mount the agent.cdsso() middleware to your
 * application)
 *
 * @constructor
 */
function CookieShield(options) {
    if (util.isObject(options)) {
        this.cookieName = options.cookieName;
        this.noRedirect = options.noRedirect;
        this.getProfiles = options.getProfiles;
        this.passThrough = options.passThrough;
        this.cdsso = options.cdsso;
    } else {
        this.cookieName = options;
    }
}

util.inherits(CookieShield, Shield);

/**
 * Main shield logic; override this method. Calls fail() or success().
 *
 * @param {Request} req
 * @param {function} success
 * @param {function} fail
 * @return {Promise}
 */
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
                if (self.passThrough)
                    return {};

                if (self.noRedirect) {
                    throw {status: 401, message: 'Unauthorized', stack: 'Invalid session'};
                } else {
                    // check for redirect loop caused by domain mismatch if not in cdsso mode
                    if (!self.cdsso) {
                        var domainMatch = false, domains = self.agent.serverInfo.domains;
                        for (var i = 0; i < domains.length; i++) {
                            if (!!~req.get('host').indexOf(domains[i]))
                                domainMatch = true;
                        }
                        if (!domainMatch)
                            throw {status: 400, message: 'Bad Request', stack: 'Domain mismatch'};
                    }

                    // redirect to to login
                    req.res.redirect(self.cdsso ? self.agent.getCDSSOUrl(req) : self.agent.openAMClient.getLoginUrl(req));
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
 * Shield implementation for enforcing Oauth2 access_tokens. This Shield implementation validates an OAuth2 access_token
 * issued by OpenAM, using OpenAM's /oauth2/tokeninfo service. The access_token must be sent in an Authorization header.
 *
 * @extends Shield
 *
 * @param {string} [realm=/]
 * @example
 * curl -H 'Authorization Bearer 2dcaac7a-8ce1-4e62-8b3a-0d0b9949cc98' http://app.example.com:8080/mobile
 *
 * @constructor
 */
function OAuth2Shield(realm) {
    this.realm = realm;
}

util.inherits(OAuth2Shield, Shield);

/**
 * Main shield logic; override this method. Calls fail() or success().
 * @param {Request} req
 * @param {function} success
 * @param {function} fail
 * @return {Promise}
 */
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
 * Shield implementation for enforcing a basic auth header. The credentials in the Authorization will be sent to OpenAM.
 * No session will be created.
 *
 * @extends Shield
 *
 * @param {object} [options] Options
 * @param {string} [options.realm=/] Name of the realm in OpenAM to which the suer should be authenticated
 * @param {string} [options.service] Name of the service (i.e. chain) used for authentication
 * @param {string} [options.module] Name of the module used for authentication (overrides {service})
 *
 * @constructor
 */
function BasicAuthShield(options) {
    if (options) {
        this.realm = options.realm;
        this.service = options.service;
        this.module = options.module;
    }
}

util.inherits(BasicAuthShield, Shield);

/**
 * Main shield logic; override this method. Calls fail() or success().
 *
 * @param {Request} req
 * @param {function} success
 * @param {function} fail
 * @return {Promise}
 */
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
 * Shield implementation for enforcing policy decisions. This shield fetches policy decisions from OpenAM for the
 * requested path, specified application name and current user. It requires a valid session cookie. Typically used in a
 * chain with CookieShield
 *
 * @extends Shield
 *
 * @param {string} [applicationName=iPlanetAMWebAgentService] Name of the entitlement application in OpenAM
 *
 * @example
 * var cookieShield = new openam.CookieShield();
 * var policyShield = new openam.PolicyShield('my-app');
 *
 * app.use('/some/protected/route', agent.shield(cookieShield), agent.shield(policyShield), function (req, res, next) {
 *    // your route handler code here
 * });
 *
 * @constructor
 */
function PolicyShield(applicationName) {
    this.applicationName = applicationName || 'iPlanetAMWebAgentService';
}

util.inherits(PolicyShield, Shield);

/**
 * Main shield logic; override this method. Calls fail() or success().
 *
 * @param {Request} req
 * @param {function} success
 * @param {function} fail
 * @return {Promise}
 */
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

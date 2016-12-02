var util = require('util'),
    Promise = require('bluebird'),
    Shield = require('./shield').Shield,
    ShieldEvaluationError = require('./shieldEvaluationError').ShieldEvaluationError,
    httpUtils = require('../httpUtils');

/**
 * Shield implementation for validating session cookies. This shield checks if the request contains a session cookie
 * and validates it against OpenAM. The session is cached if notifications are enabled, otherwise it's re-validated for
 * every request.
 *
 * @extends Shield
 *
 * @param {object} [options] Options
 * @param {boolean} [options.noRedirect=false] If true, the agent will not redirect to OpenAM's login page for
 * authentication, only return a 401 response
 * @param {boolean} [options.getProfiles=false] If true, the agent will fetch and cache the user's profile when
 * validating the session
 * @param {boolean} [options.passThrough=false] If true, the shield will not enforce valid sessions. This is useful
 * in conjunction with {getProfiles:true} when a route is public but you want fetch identity information for any logged
 * in users.
 * @param {boolean} [options.cdsso=false] Enable CDSSO mode (you must also mount the agent.cdsso() middleware to your
 * application)
 *
 * @constructor
 */
function CookieShield(options) {
    options = options || {};

    this.noRedirect = options.noRedirect || false;
    this.getProfiles = options.getProfiles || false;
    this.passThrough = options.passThrough || false;
    this.cdsso = options.cdsso || false;
}

util.inherits(CookieShield, Shield);

/**
 * This is the main shield logic. The request is checked for a valid session ID.
 * @param {http~IncomingMessage} request Request
 * @param {http~ServerResponse} response Response
 * @param {PolicyAgent} agent Agent instance
 * @return {Promise<{id: string, data: *}>}
 */
CookieShield.prototype.evaluate = function (request, response, agent) {
    var self = this, sessionId,
        resolve,
        reject;

    var promise = new Promise(function (_resolve, _reject) {
        reject = _reject;
        resolve = _resolve;
    });

    agent.getSessionIdFromRequest(request)
        .then(function (sid) {
            sessionId = sid;
            return agent.validateSession(sessionId);
        })
        .then(function (res) {
            if (res.valid) {
                agent.logger.info('CookieShield: %s => allow', request.url);

                // get profile
                if (!res.dn && self.getProfiles) {
                    // resolve with the user's profile data
                    return agent
                        .getUserProfile(res.uid, res.realm, sessionId)
                        .then(function (userProfile) {
                            return util._extend(res, userProfile);
                        });
                } else {
                    return res;
                }
            } else {
                // passthrough mode -- proceed without getting the user profile or checking the session
                if (self.passThrough) {
                    // resolve with an empty session data object
                    agent.logger.info('CookieShield: %s => passthrough', request.url);
                    return {};
                }

                agent.logger.info('CookieShield: %s => deny', request.url);

                // do not redirect to the login page, just return a 401 response
                if (self.noRedirect) {
                    throw new ShieldEvaluationError(401, 'Unauthorized', 'Invalid session');
                } else {
                    // check for a redirect loop caused by domain mismatch if not in cdsso mode
                    if (!self.cdsso) {
                        var domainMatch = false, domains = agent.serverInfo.domains;
                        for (var i = 0; i < domains.length; i++) {
                            if (request.headers.host.indexOf(domains[i]) >= 0) {
                                domainMatch = true;
                            }
                        }
                        if (!domainMatch) {
                            throw new ShieldEvaluationError(400, 'Bad Request', 'Domain mismatch');
                        }
                    }

                    // redirect to to login
                    httpUtils.redirect(response, self.cdsso ? agent.getCDSSOUrl(request) : agent.getLoginUrl(request));
                }
            }
        })
        .then(function (res) {
            if (res) {
                // only resolve the wrapper promise if there is a result
                // otherwise it was a redirect, so it should not be resolved
                resolve({key: sessionId, data: res});
            }
        })
        .catch(function (err) {
            var prettyError = JSON.stringify(err, null, 2);

            agent.logger.silly('CookieShield: ', prettyError);

            // reject with the error (box it if needed)
            if (err instanceof ShieldEvaluationError) {
                reject(err);
            } else {
                reject(new ShieldEvaluationError(
                    err.statusCode || err.status || 500,
                    err.name || err.message,
                    err.stack + '\n' + prettyError
                ));
            }
        });

    return promise;
};

module.exports.CookieShield = CookieShield;

var util = require('util'),
    Shield = require('./shield').Shield;

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
 * Main shield logic; override this method. Calls fail() or success().
 *
 * @param {Request} req
 * @param {function} success
 * @param {function} fail
 * @return {Promise}
 */
CookieShield.prototype.evaluate = function (req, success, fail) {
    var self = this, sessionId;

    return self.agent.getSessionIdFromRequest(req)
        .then(function (sid) {
            sessionId = sid;
            return self.agent.validateSession(sessionId);
        })
        .then(function (res) {
            if (res.valid) {

                self.agent.logger.info('CookieShield: %s => allow', req.originalUrl);

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

                self.agent.logger.info('CookieShield: %s => deny', req.originalUrl);

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
                    req.res.redirect(self.cdsso ? self.agent.getCDSSOUrl(req) : self.agent.getLoginUrl(req));
                }
            }
        })
        .then(function (res) {
            if (res)
                success(sessionId, res);
        })
        .catch(function (err) {
            fail(err.statusCode || 500, err.name || err.message, err.stack + '\n' + JSON.stringify(err, null, 2));
        });
};

module.exports.CookieShield = CookieShield;

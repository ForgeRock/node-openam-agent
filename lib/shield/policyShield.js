var util = require('util'),
    Shield = require('./shield').Shield;

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
 * var agent = openamAgent(options),
 *     cookieShield = openamAgent.policyShield('myApp');
 *
 * app.use('/some/protected/route', agent.shield(policyShield), function (req, res, next) {
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
    var self = this;

    var params = {
        resources: [req.originalUrl],
        application: self.applicationName,
        subject: {}
    };

    self.agent.getSessionIdFromRequest(req)
        .then(function (sessionId) {
            params.subject.ssoToken = sessionId;
            self.agent.logger.silly('PolicyShield: requesting policy decision for %s', JSON.stringify(params, null, 2));
            return self.agent.getPolicyDecision(params);
        })
        .then(function (decision) {
            if (decision) {
                self.agent.logger.silly('PolicyShield: decision %s', JSON.stringify(decision, null, 2));
                if (decision[0].actions[req.method]) {
                    req.session.data.policies = decision;
                    self.agent.logger.info('PolicyShield: %s => allow', req.originalUrl);
                    success(req.session.key, req.session.data);
                } else {
                    self.agent.logger.info('PolicyShield: %s => deny', req.originalUrl);
                    fail(403, 'Forbidden', 'You are not authorized to access this resource.');
                }
            }
        })
        .catch(function (err) {
            self.agent.logger.silly('PolicyShield: ', JSON.stringify(err, null, 2));
            fail(err.statusCode || err.status || 500, err.name || err.message, err.stack + '\n' + JSON.stringify(err, null, 2));
        });
};

module.exports.PolicyShield = PolicyShield;

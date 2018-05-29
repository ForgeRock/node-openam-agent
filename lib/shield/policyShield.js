var util = require('util'),
    Shield = require('./shield').Shield,
    ShieldEvaluationError = require('./shieldEvaluationError').ShieldEvaluationError;

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
 * @param {http~IncomingMessage} request Request
 * @param {http~ServerResponse} response Response
 * @param {PolicyAgent} agent Agent instance
 * @return {Promise<{id: string, data: *}>}
 */
PolicyShield.prototype.evaluate = function (request, response, agent) {
    var params = {
        resources: [request.originalUrl || request.url],
        application: this.applicationName,
        subject: {}
    };

    return agent.getSessionIdFromRequest(request)
        .then(function (sessionId) {
            params.subject.ssoToken = sessionId;
            agent.logger.silly('PolicyShield: requesting policy decision for %s', JSON.stringify(params, null, 2));
            return agent.getPolicyDecision(params);
        })
        .then(function (decision) {
            if (decision) {
                agent.logger.silly('PolicyShield: decision %s', JSON.stringify(decision, null, 2));
                if (decision[0].actions[request.method]) {
                    request.session.data.policies = decision;
                    agent.logger.info('PolicyShield: %s => allow', request.url);
                    return request.session;
                } else {
                    agent.logger.info('PolicyShield: %s => deny', request.url);
                    throw new ShieldEvaluationError(403, 'Forbidden', 'You are not authorized to access this resource.');
                }
            }
        })
        .catch(function (err) {
            agent.logger.silly('PolicyShield: ', JSON.stringify(err, null, 2));
            if (err instanceof ShieldEvaluationError) {
                throw err;
            } else {
                throw new ShieldEvaluationError(
                    err.statusCode || err.status || 500,
                    err.name || err.message,
                    err.stack + '\n' + JSON.stringify(err, null, 2)
                );
            }
        });
};

module.exports.PolicyShield = PolicyShield;

var util = require('util'),
    Promise = require('bluebird'),
    basicAuth = require('basic-auth'),
    Shield = require('./shield').Shield,
    ShieldEvaluationError = require('./shieldEvaluationError').ShieldEvaluationError,
    httpUtils = require('../httpUtils');

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
 * @param {http~IncomingMessage} request Request
 * @param {http~ServerResponse} response Response
 * @param {PolicyAgent} agent Agent instance
 * @return {Promise<{id: string, data: *}>}
 */
BasicAuthShield.prototype.evaluate = function (request, response, agent) {

    var self = this,
        user = basicAuth(request),
        resolve,
        reject;

    // wrapper promise
    var promise = new Promise(function (_resolve, _reject) {
        reject = _reject;
        resolve = _resolve;
    });

    function sendChallenge() {
        httpUtils.sendResponse(response, 401, null, {
            'WWW-Authenticate': 'Basic realm=Authorization Required'
        });
    }

    if (!user) {
        // no credentials => throw error to present challenge
        agent.logger.info('BasicAuthShield: %s => unauthenticated', request.url);
        sendChallenge();
    } else {
        // credentials found => authenticate
        agent.openAMClient
            .authenticate(user.name, user.pass, self.realm, self.service, self.module, true)
            .then(function () {
                agent.logger.info('BasicAuthShield: %s => allow', request.url);
                resolve({key: user.name, data: {username: user.name}});
            })
            .catch(function (err) {
                agent.logger.info('BasicAuthShield: %s => deny', request.url);
                reject(new ShieldEvaluationError(
                    err.statusCode || err.status || 500,
                    err.name || err.message,
                    err.stack + '\n' + JSON.stringify(err, null, 2)
                ));
            });
    }

    return promise;
};

module.exports.BasicAuthShield = BasicAuthShield;

var util = require('util'),
    Promise = require('bluebird'),
    Shield = require('./shield').Shield,
    ShieldEvaluationError = require('./shieldEvaluationError').ShieldEvaluationError;

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
 * @param {http~IncomingMessage} request Request
 * @param {http~ServerResponse} response Response
 * @param {PolicyAgent} agent Agent instance
 * @return {Promise<{id: string, data: *}>}
 */
OAuth2Shield.prototype.evaluate = function (request, response, agent) {

    var authorizationHeader = request.headers.authorization || '',
        accessToken = authorizationHeader.replace('Bearer', '').trim();

    return Promise.resolve()
        .then(function () {
            if (accessToken.length) {
                return agent.openAMClient.validateAccessToken(accessToken, this.realm);
            } else {
                agent.logger.info('OAuth2Shield: %s => deny', request.url);
                throw new ShieldEvaluationError(401, 'Unauthorized', 'Missing OAuth2 Bearer token');
            }
        })
        .then(function (res) {
            agent.logger.info('OAuth2Shield: %s => allow', request.url);
            agent.logger.silly(res);
            return {key: accessToken, data: res};
        })
        .catch(function (err) {
            var status = err.response.statusCode || 500,
                message = 'Internal server error';

            try {
                message = JSON.parse(err.response.body).error_description;
            } catch (e) {
                // body is not json
            }

            throw new ShieldEvaluationError(status, message);
        });

};

module.exports.OAuth2Shield = OAuth2Shield;

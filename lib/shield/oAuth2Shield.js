var util = require('util'),
    Shield = require('./shield').Shield;

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

module.exports.OAuth2Shield = OAuth2Shield;

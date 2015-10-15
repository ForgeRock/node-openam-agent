var util = require('util'),
    basicAuth = require('basic-auth'),
    Shield = require('./shield').Shield;

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

module.exports.BasicAuthShield = BasicAuthShield;

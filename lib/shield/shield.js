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

module.exports.Shield = Shield;

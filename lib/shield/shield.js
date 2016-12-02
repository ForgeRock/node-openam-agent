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
 * MyShield.prototype.evaluate = function (req, res, agent) {
 *    if (this.options.foo) {
 *        // do something here, perhaps with {req} or {agent}...
 *
 *        // return a session object
 *        return {
 *            key: 'foo',
 *            data: {
 *                bar: 'baz
 *            }
 *        };
 *    } else {
 *        throw new ShieldEvaluationError(401, 'Unauthorized', 'Something doesn\'t check out...');
 *    }
 * };
 *
 * // including it in an express app
 *
 * app.use(agent.shield(new MyShield({foo: 'bar'})));
 */
function Shield() {
}

/**
 * Main shield logic; override this method. Calls fail() or success().
 *
 * @param req {http~IncomingMessage} HTTP request
 * @param res {http~ServerResponse} HTTP response
 * @param agent {PolicyAgent} Agent instance
 * @return {Promise<{id: string, data: *}>}
 * @abstract
 */
Shield.prototype.evaluate = function (req, res, agent) {
    throw new Error('Abstract evaluate method should be overridden.');
};

module.exports.Shield = Shield;

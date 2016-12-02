/**
 * @param statusCode {number} Status code
 * @param message {string} Error message
 * @param {string} [stack]  Error description or stack trace
 * @constructor
 */
function ShieldEvaluationError(statusCode, message, stack) {
    this.statusCode = statusCode;
    this.message = message;
    this.stack = stack;
}

ShieldEvaluationError.toString = function () {
    return this.message;
};

module.exports.ShieldEvaluationError = ShieldEvaluationError;

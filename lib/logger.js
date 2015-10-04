var winston = require('winston');


function logger(level, id) {
    var l = new winston.Logger({
        transports: [new winston.transports.Console({level: level || 'error', timestamp: true})]
    });

    // always log the id if there is one
    if (id) {
        l.log = function () {
            arguments[1] = '[' + id + '] ' + arguments[1];
            return winston.Logger.prototype.log.apply(this, arguments);
        };
    }

    return l;
}

module.exports = logger;

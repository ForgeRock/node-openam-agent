var winston = require('winston');


function logger(level) {
    return new winston.Logger({
        transports: [new winston.transports.Console({level: level || 'error', timestamp: true})]
    });
}

module.exports = logger;

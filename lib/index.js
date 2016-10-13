var util = require('util'),
    agent = require('./agent'),
    shield = require('./shield'),
    openam = require('./openam'),
    logger = require('./logger');


module.exports = function (options) {
    var policyAgent = new agent.PolicyAgent(options);
    policyAgent.init();
    return policyAgent;
};

util._extend(module.exports, agent);
util._extend(module.exports, shield);
util._extend(module.exports, openam);
util._extend(module.exports, logger);

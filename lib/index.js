var util = require('util'),
    strategy = require('./strategy'),
    agent = require('./agent');

util._extend(module.exports, strategy);
util._extend(module.exports, agent);

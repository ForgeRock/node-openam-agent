var util = require('util'),
    agent = require('./agent'),
    shield = require('./shield'),
    openam = require('./openam'),
    notifications = require('./notifications');

util._extend(module.exports, agent);
util._extend(module.exports, shield);
util._extend(module.exports, openam);
util._extend(module.exports, notifications);

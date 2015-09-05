var util = require('util'),
    Strategy = require('passport-strategy');

function OpenAMStrategy() {
    Strategy.call(this);
}

util.inherits(OpenAMStrategy, Strategy);

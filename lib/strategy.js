var util = require('util'),
    cookie = require('cookie'),
    Strategy = require('passport-strategy'),
    OpenAMClient = require('./openam').OpenAMClient;

/**
 *
 * The strategy will use an agent profile in OpenAM to retrieve policy decisions.
 *
 * @param config
 * @constructor
 * @example
 *     passport.use(new OpenAMStrategy({
 *         serverUrl: 'http://openam.example.com:8080/openam',
 *         username: 'passportAgentUser',
 *         password: 'secret123'
 *     })
 */
function OpenAMStrategy(config) {
    Strategy.call(this);
    this.name = 'openam';
    this.config = config;
    this._openam = new OpenAMClient(config);
}

util.inherits(OpenAMStrategy, Strategy);

Strategy.prototype.authenticate = function (req, options) {
    options = options || {};
    if (!options.noRedirect) {
        options.failureRedirect = this._openam.getLoginUrl(req);
    }

    var self = this, info;

    this._openam.serverInfo
        .then(function (serverInfo) {
            var cookies = cookie.parse(req.headers.cookie || ''),
                sessionId = cookies[serverInfo.cookieName];
            return self._openam.validateSession(sessionId);
        })
        .then(function (res) {
            //console.log(res);
            info = res;
            if (res.valid) {
                if (self.config.authorize || options.authorize) {
                    // evaluate policies
                    return self._openam.getPolicyDecision(req);
                } else {
                    self.success(info.uid, info);
                }
            } else {
                self.fail('Invalid session');
            }
        })
        .then(function (decision) {
            if (decision) {
                //console.log('Policy decision: %s', decision);
                if (decision[0].actions[req.method]) {
                    self.success(info.uid, info);
                } else {
                    req.res.status(403).send('Forbidden');
                }
            }
        })
        .catch(function (err) {
            self.error(err);
        });
};

module.exports.OpenAMStrategy = OpenAMStrategy;

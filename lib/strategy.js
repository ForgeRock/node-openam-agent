var util = require('util'),
    cookie = require('cookie'),
    Strategy = require('passport-strategy'),
    PolicyAgent = require('./agent').PolicyAgent;

/**
 *
 * The strategy will use an agent profile in OpenAM to retrieve policy decisions.
 *
 * @constructor
 * @example
 *     passport.use(new OpenAMStrategy({
 *         serverUrl: 'http://openam.example.com:8080/openam',
 *         username: 'passportAgentUser',
 *         password: 'secret123'
 *     })
 * @param agent PolicyAgent
 */
function OpenAMStrategy(agent) {
    Strategy.call(this);
    this.name = 'openam';
    this.agent = agent;

    if(!(agent instanceof PolicyAgent)) {
        throw new Error('missing PolicyAgent')
    }
}

util.inherits(OpenAMStrategy, Strategy);

Strategy.prototype.authenticate = function (req, options) {
    options = options || {};
    if (!options.noRedirect)
        options.failureRedirect = this.agent.getLoginUrl(req);

    var self = this, info;

    if (self.agent.isNotEnforced(req))
        return self.success(null, null);

    this.agent.serverInfo
        .then(function (serverInfo) {
            var cookies = cookie.parse(req.headers.cookie || ''),
                sessionId = cookies[serverInfo.cookieName];
            return self.agent.validateSession(sessionId);
        })
        .then(function (res) {
            //console.log(res);
            info = res;
            if (res.valid) {
                if (!self.agent.ssoOnlyMode) {
                    // evaluate policies
                    return self.agent.getPolicyDecision(req);
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

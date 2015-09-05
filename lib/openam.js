var request = require('request-promise').defaults({json: true}),
    cookie = require('cookie'),
    Promise = require('promise'),
    util = require('util');

function OpenAMClient(config) {
    if (typeof config.serverUrl !== 'string') {
        throw new Error('missing serverUrl');
    }

    var self = this,
        serverUrl = config.serverUrl.replace(/\/$/, ''),
        username = config.username,
        password = config.password,
        applicationName = config.applicationName,
        session = {};

    this.getServerInfo = function () {
        return request.get(serverUrl + '/json/serverinfo/*', {json: true});
    };

    this.authenticate = function (username, password) {
        return request.post(serverUrl + '/json/authenticate', {
            headers: {
                'X-OpenAM-Username': username,
                'X-OpenAM-Password': password
            }
        });
    };

    this.authenticateAgent = function () {
        return this.getServerInfo()
            .then(function () {
                return self.authenticate(username, password);
            })
            .then(function (res) {
                console.log(res);
                session[self.serverInfo.cookieName] = res.tokenId;
            })
            .catch(function (err) {
                throw err;
            });
    };

    this.validateSession = function (sessionId) {
        return request.post(serverUrl + '/json/sessions/' + sessionId, {
            qs: {_action: 'validate'},
            headers: {
                'Content-Type': 'application/json'
            }
        });
    };

    this.getLoginUrl = function (req) {
        return serverUrl + '/UI/Login?goto=' +
            encodeURIComponent(req.protocol + '://' + req.get('host') + req.originalUrl);
    };

    this.getPolicyDecision = function (req) {
        var cookies = cookie.parse(req.headers.cookie);
        return new Promise(function (resolve, reject) {
            request.post(serverUrl + '/json/policies', {
                headers: session,
                qs: {
                    _action: 'evaluate'
                },
                body: {
                    resources: [req.originalUrl],
                    application: applicationName,
                    subject: {
                        ssoToken: cookies[self.serverInfo.cookieName]
                    }
                }
            })
                .then(resolve)
                .catch(function (res) {
                    // agent session expired
                    if (res.error.code === 401) {
                        console.error('Agent session invalid; refreshing.');
                        self.authenticateAgent().then(function () {
                            resolve(self.getPolicyDecision(req));
                        });
                    } else {
                        reject(res);
                    }
                });
        });
    };

    this.serverInfo = this.getServerInfo().then(function (res) {
        util._extend(self.serverInfo, res);
        return res;
    });
}

module.exports.OpenAMClient = OpenAMClient;

var shutdownHandler = require('shutdown-handler'),
    request = require('request-promise').defaults({json: true}),
    builder = require('xmlbuilder'),
    cookie = require('cookie'),
    Promise = require('promise'),
    util = require('util'),
    notifications = require('./notifications');

function PolicyAgent(config) {
    if (typeof config.serverUrl !== 'string') {
        throw new Error('missing serverUrl');
    }

    var self = this,
        serverUrl = config.serverUrl.replace(/\/$/, ''),
        appUrl = config.appUrl,
        notificationRoute = config.notificationRoute,
        notificationsEnabled = config.notificationsEnabled,
        username = config.username,
        password = config.password,
        realm = config.realm || '/',
        notificationUrl = notificationRoute.replace(/\/$/, '') + '/agent/notification',
        notEnforced = [notificationUrl].concat(config.notEnforced),
        applicationName = config.applicationName,
        session = {},
        sessionCache = {};

    // get or set the agent's session id
    function agentSessionId(sessionId) {
        var key = self.serverInfo.cookieName;
        if (sessionId)
            return session[key] = sessionId;
        return session[key];
    }

    this.getServerInfo = function () {
        return request.get(serverUrl + '/json/serverinfo/*', {json: true});
    };

    this.authenticate = function (username, password, realm) {
        return request.post(serverUrl + '/json/authenticate', {
            headers: {
                'X-OpenAM-Username': username,
                'X-OpenAM-Password': password
            },
            qs: {
                realm: realm || '/'
            }
        });
    };

    this.authenticateAgent = function () {
        return self.getServerInfo()
            .then(function () {
                return self.authenticate(username, password, realm);
            })
            .then(function (res) {
                console.log('agent session created: %s', res.tokenId);
                return agentSessionId(res.tokenId);
            })
            .catch(function (err) {
                throw err;
            });
    };

    this.logout = function (sessionId) {
        if (!sessionId)
            return Promise.resolve();

        return request.post(serverUrl + '/identity/logout', {
            form: {
                subjectid: sessionId
            }
        })
    };

    this.validateSession = function (sessionId) {
        if (sessionCache[sessionId])
            return {valid: true};

        return request.post(serverUrl + '/json/sessions/' + sessionId, {
            qs: {_action: 'validate'},
            headers: {
                'Content-Type': 'application/json'
            }
        }).then(function (res) {
            if (res.valid && notificationsEnabled)
                self.registerSessionListener(sessionId);
            return res;
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

    this.sessionServiceRequest = function (requestSet) {
        return session.promise.then(function () {
            request.post(serverUrl + '/sessionservice', {
                headers: {
                    'Content-Type': 'text/xml'
                },
                body: requestSet,
                json: false
            });
        });
    };

    this.registerSessionListener = function (sessionId) {
        var sessionRequest = builder
            .create({
                SessionRequest: {
                    '@vers': '1.0',
                    '@reqid': '101',
                    '@requester': new Buffer('token:' + agentSessionId()).toString('base64')
                }
            })
            .ele('AddSessionListener')
            .ele({
                'URL': appUrl + notificationUrl,
                'SessionID': sessionId
            })
            .end();

        var requestSet = builder
            .create({
                RequestSet: {
                    '@vers': '1.0',
                    '@svcid': 'Session',
                    '@reqid': '100'
                }
            })
            .ele('Request')
            .cdata(sessionRequest)
            .end();

        return self.sessionServiceRequest(requestSet).then(function () {
            // TODO check response (but 200 should mean it worked)
            console.log('listener registered for session: %s', sessionId);
            sessionCache[sessionId] = 1;
        });
    };

    this.isNotEnforced = function (req) {
        return !!~notEnforced.indexOf(req.originalUrl);
    };

    this.serverInfo = this.getServerInfo().then(function (res) {
        util._extend(self.serverInfo, res);
        return res;
    });

    this.ssoOnlyMode = config.ssoOnlyMode;

    this.notifications = notifications;

    // remove session from cache when destroyed
    notifications.on('session', function (session) {
        console.log('session notification received');
        if (session.state === 'destroyed') {
            console.log('removing destroyed session from cache: %s', session.sid);
            delete sessionCache[session.sid];
        }
    });

    // create agent session
    session.promise = self.serverInfo.then(self.authenticateAgent);

    // destroy agent session on exit
    shutdownHandler.on('exit', function (e) {
        e.preventDefault();
        console.log('destroying agent session');
        self.logout(agentSessionId()).finally(process.exit);
    })
}

module.exports.PolicyAgent = PolicyAgent;

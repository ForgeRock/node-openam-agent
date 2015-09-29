var fs = require('fs'),
    shutdownHandler = require('shutdown-handler'),
    request = require('request-promise').defaults({json: true}),
    builder = require('xmlbuilder'),
    Promise = require('promise'),
    util = require('util'),
    swig = require('swig'),
    uuid = require('uuid'),
    cookie = require('cookie'),
    logger = require('./logger'),
    Cache = require('./cache').Cache,
    NotificationHandler = require('./notifications').NotificationHandler,
    OpenAMClient = require('./openam').OpenAMClient;

function PolicyAgent(config) {
    if (typeof config.serverUrl !== 'string') {
        throw new Error('missing serverUrl');
    }

    var self = this,
        serverUrl = config.serverUrl.replace(/\/$/, ''),
        notificationUrl = (config.notificationRoute || '').replace(/\/$/, '') + '/agent/notification',
        sessionCacheTime = config.notificationsEnabled ? 0 : config.sessionCacheTime || 300;

    this.config = config;
    this.openAMClient = config.openAMClient || new OpenAMClient(serverUrl);
    this.logger = config.logger || logger(config.logLevel);
    this.notifications = new NotificationHandler({logger: this.logger});

    // caches
    this.sessionCache = new Cache(sessionCacheTime);
    this.requestCache = new Cache();
    this.policyCache = new Cache(); // TODO

    this.authenticateAgent = function () {
        return self.openAMClient
            .authenticate(config.username, config.password, config.realm)
            .then(function (res) {
                self.logger.info('agent session created: %s', res.tokenId);
                return res;
            });
    };

    this.validateSession = function (sessionId) {
        var cached = self.sessionCache.get(sessionId);
        if (cached)
            return Promise.resolve(cached);

        return self.openAMClient.validateSession(sessionId).then(function (res) {
            if (res.valid) {
                self.logger.info('session %s is valid; saving to cache', sessionId);
                self.sessionCache.put(sessionId, res);
                if (self.config.notificationsEnabled) {
                    self.registerSessionListener(sessionId);
                }
            } else {
                self.logger.info('session %s is invalid', sessionId);
            }
            return res;
        });
    };

    this.getUserProfile = function (userId, realm, sessionId) {
        return self.agentSession
            .then(function (agentSession) {
                return self.openAMClient.getProfile(userId, realm, sessionId, agentSession.cookieName);
            });
    };

    this.getPolicyDecision = function (params) {
        return self.agentSession
            .then(function (agentSession) {
                return self.openAMClient.getPolicyDecision(params, agentSession.sessionId, agentSession.cookieName);
            });
    };

    this.registerSessionListener = function (sessionId) {
        return self.agentSession.then(function (agentSession) {
            var sessionRequest = builder
                .create({
                    SessionRequest: {
                        '@vers': '1.0',
                        '@reqid': '101',
                        '@requester': new Buffer('token:' + agentSession.sessionId).toString('base64')
                    }
                })
                .ele('AddSessionListener')
                .ele({
                    'URL': config.appUrl + notificationUrl,
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

            return self.openAMClient.sessionServiceRequest(requestSet).then(function () {
                self.logger.info('registered session listener for %s', sessionId);
            });
        });
    };

    this.shield = function (shield) {
        shield.init(self);

        return function (req, res, next) {
            function success(sessionKey, sessionData) {
                if (sessionKey)
                    req.session = {
                        key: sessionKey,
                        data: sessionData
                    };
                next();
            }

            function fail(status, message, details) {
                // handle response if unhandled
                if (!res.headersSent) {
                    var template = swig.compileFile(config.errorTemplate || (__dirname + '/templates/error.html'));
                    res.status(status || 403).send(template({
                        status: status,
                        message: message,
                        details: details,
                        pkg: JSON.parse(fs.readFileSync(__dirname + '/../package.json'))
                    }));
                }
            }

            if (req.originalUrl === notificationUrl) {
                // don't evaluate the notification url
                // TODO: verify that it's an authorized notification
                success();
            } else {
                shield.evaluate(req, success, fail);
            }
        }
    };

    // TODO
    this.persistRequest = function (req) {
        var cookieName = 'openamAgentPersistRequest',
            reqId = uuid.v4(),
            serializedReq = {
                method: req.method,
                originalUrl: req.originalUrl,
                body: req.body,
                headers: req.headers
            };
        self.logger.info('persisting request', reqId, JSON.stringify(serializedReq));
        self.requestCache.put(reqId, serializedReq);
        req.res.cookie(cookieName, reqId);
        return reqId;
    };


    this.serverInfo = self.openAMClient.getServerInfo().then(function (res) {
        util._extend(self.serverInfo, res);
        return res;
    });

    this.agentSession = self.serverInfo
        .then(self.authenticateAgent)
        .then(function (res) {
            var session = {
                cookieName: self.serverInfo.cookieName,
                sessionId: res.tokenId
            };

            util._extend(self.agentSession, session);

            return session;
        });

    // remove session from cache when destroyed
    self.notifications.on('session', function (session) {
        self.logger.info('session notification received');
        if (session.state === 'destroyed') {
            self.logger.info('removing destroyed session from cache: %s', session.sid);
            self.sessionCache.remove(session.sid);
        }
    });

    // destroy agent session on exit
    shutdownHandler.on('exit', function (e) {
        e.preventDefault();
        self.logger.info('destroying agent session %s', self.agentSession.sessionId);
        self.openAMClient
            .logout(self.agentSession.sessionId)
            .finally(process.exit);
    });
}

module.exports.PolicyAgent = PolicyAgent;

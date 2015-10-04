var fs = require('fs'),
    shutdownHandler = require('shutdown-handler'),
    builder = require('xmlbuilder'),
    Promise = require('promise'),
    util = require('util'),
    swig = require('swig'),
    shortid = require('shortid'),
    logger = require('./logger'),
    Cache = require('./cache').Cache,
    NotificationHandler = require('./notifications').NotificationHandler,
    OpenAMClient = require('./openam').OpenAMClient;

/**
 * Main Policy Agent class
 * @param config
 * @constructor
 */
function PolicyAgent(config) {
    if (typeof config.serverUrl !== 'string') {
        throw new Error('missing serverUrl');
    }

    var self = this,
        serverUrl = config.serverUrl.replace(/\/$/, ''),
        notificationUrl = (config.notificationRoute || '').replace(/\/$/, '') + '/agent/notification',
        sessionCacheTime = config.notificationsEnabled ? 0 : config.sessionCacheTime || 300;

    /**
     * Runs a request-promise type function several times if it fails with a 401 status code;
     * creates a new agent session before sending the request again
     * @param reqFn Function that returns a Promise
     * @param attempts Number number of attempts to retry the function; default: 0 (no retries)
     * @param name String name (optional)
     */
    function reRequest(reqFn, attempts, name) {
        var attemptCount = 0;
        return self.agentSession.then(reqFn).catch(function (err) {
            if (err.statusCode === 401 && attemptCount < (attempts || 0)) {
                attemptCount++;
                self.logger.info('%s: HTTP 401; retrying after authenticating the agent (attempt %s)', name || 'reRequest', attemptCount);
                return self.authenticateAgent().then(reqFn);
            } else {
                throw err;
            }
        });
    }

    this.id = shortid.generate();
    this.config = config;
    this.openAMClient = config.openAMClient || new OpenAMClient(serverUrl);
    this.logger = config.logger || logger(config.logLevel, this.id);
    this.notifications = new NotificationHandler({logger: this.logger});

    // caches
    this.sessionCache = new Cache(sessionCacheTime);
    this.policyCache = new Cache(); // TODO

    this.authenticateAgent = function () {
        return self.agentSession = self.serverInfo
            .then(function () {
                return self.openAMClient.authenticate(config.username, config.password, config.realm);
            })
            .then(function (res) {
                self.logger.info('agent session created: %s', res.tokenId);
                util._extend(self.agentSession, {
                    cookieName: self.serverInfo.cookieName,
                    sessionId: res.tokenId
                });
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
            .then(function () {
                return self.openAMClient.getProfile(userId, realm, sessionId, self.serverInfo.cookieName);
            });
    };

    this.getPolicyDecision = function (params) {
        return reRequest(function () {
            return self.openAMClient.getPolicyDecision(params, self.agentSession.sessionId, self.serverInfo.cookieName);
        }, 5, 'getPolicyDecision');
    };

    this.registerSessionListener = function (sessionId) {
        return reRequest(function () {
            var sessionRequest = builder
                .create({
                    SessionRequest: {
                        '@vers': '1.0',
                        '@reqid': '101',
                        '@requester': new Buffer('token:' + self.agentSession.sessionId).toString('base64')
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
        }, 5, 'registerSessionListener');
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

    // should the server info be cached at all?
    this.serverInfo = self.openAMClient.getServerInfo().then(function (res) {
        util._extend(self.serverInfo, res);
        return res;
    });

    // the agent session will only get created when it's needed
    this.agentSession = Promise.resolve();

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

    self.logger.info('Agent initialized.');
}

module.exports.PolicyAgent = PolicyAgent;

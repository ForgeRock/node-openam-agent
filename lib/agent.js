var fs = require('fs'),
    shutdownHandler = require('shutdown-handler'),
    builder = require('xmlbuilder'),
    Promise = require('promise'),
    util = require('util'),
    swig = require('swig'),
    shortid = require('shortid'),
    logger = require('./logger'),
    SimpleCache = require('./cache').SimpleCache,
    NotificationHandler = require('./notifications').NotificationHandler,
    OpenAMClient = require('./openam').OpenAMClient;

/**
 * @constructor
 *
 * @param {object} options
 * @param {string} options.serverUrl The deployment URI of the OpenAM server, e.g. http://openam.example.com:8080/openam
 * @param {string} options.username Agent username (needed for certain operations, e.g. policy decision requests)
 * @param {string} options.password Agent password (needed for certain operations, e.g. policy decision requests)
 * @param {string} options.realm=/ Agent realm (needed for certain operations, e.g. policy decision requests)
 * @param {boolean} [options.notificationsEnabled] If enabled, the agent will cache sessions and register a change
 * listener for them in OpenAM. Cached sessions will not be revalidated against OpenAM. The notifications middleware
 * has be added to the express application for notifications to work (adds an /agent/notifications endpoint which can
 * receive notifications from OpenAM).
 * @param {string} [options.notificationRoute] The route on which the notifications middleware is mounted.
 * @param {string} [options.appUrl] The root URL of the application, e.g. http://app.example.com:8080
 * (required for notifications)
 * @param {function} options.errorPage Callback function; If present, the function's return value will be sent as an
 * error page, otherwise the default error template will be used.
 * @param {winston~Logger} [options.logger=new Logger()] A winstonjs logger instance. If undefined, a new Console logger
 * is created.
 * @param {string} [options.logLevel=error] logging level see winston's documentation Default: error. Only used when
 * logger is undefined.
 *
 * @example
 * var express = require('express'),
 *     openamAgent = require('openam-agent')
 *     PolicyAgent = openamAgent.PolicyAgent,
 *     CookieShield = openamAgent.CookieShield,
 *     MemcachedCache = openamAgent.MemcachedCache;
 *
 * var config = {
 *    serverUrl: 'http://openam.example.com:8080/openam',
 *    appUrl: 'http://app.example.com:8080',
 *    notificationRoute: '/',
 *    notificationsEnabled: true,
 *    username: 'my-agent',
 *    password: 'changeit',
 *    realm: '/',
 *    logLevel: 'info',
 *    cache: new MemcachedCache({url: 'localhost:11211', expiresAfterSeconds: 600}),
 *    errorPage: function (status, message, details) {
 *        return '<html><body><h1>' + status + ' - '  + message + '</h1></body></html>'
 *    }
 * };
 *
 * var agent = new PolicyAgent(config);
 * var app = express();
 *
 * app.use(agent.shield(new CookieShield()));
 * app.use('/foo/bar/baz', agent.notifications);
 *
 * app.listen(8080);
 */
function PolicyAgent(options) {
    if (typeof options.serverUrl !== 'string') {
        throw new Error('missing serverUrl');
    }

    var self = this,
        serverUrl = options.serverUrl.replace(/\/$/, ''),
        notificationUrl = (options.notificationRoute || '').replace(/\/$/, '') + '/agent/notification',
        sessionCacheTime = options.notificationsEnabled ? 0 : options.sessionCacheTime || 300;

    /**
     * Runs a request-promise type function several times if it fails with a 401 status code;
     * creates a new agent session before sending the request again
     * @param {function} reqFn Function that returns a Promise
     * @param {number} attempts Number of attempts to retry the function; default: 0 (no retries)
     * @param {string} [name] Name
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

    /**
     * Short random ID that lets you differentiate agents in logs, etc.
     */
    this.id = shortid.generate();

    /**
     * OpenAM client used by the agent and its shields
     * @type {*|OpenAMClient}
     */
    this.openAMClient = options.openAMClient || new OpenAMClient(serverUrl);

    /**
     * Logger
     * @type {winston~Logger|*}
     */
    this.logger = options.logger || logger(options.logLevel, this.id);

    /**
     * Notification handler
     * @type {*|NotificationHandler}
     */
    this.notifications = new NotificationHandler({logger: this.logger});

    /**
     * Session cache
     * @type {*|SimpleCache}
     */
    this.sessionCache = options.cache || new SimpleCache(sessionCacheTime);

    /**
     * Authenticates the policy agent using the credentials in the config object.
     *
     * @return {Promise}
     */
    this.authenticateAgent = function () {
        return self.agentSession = self.serverInfo
            .then(function () {
                return self.openAMClient.authenticate(options.username, options.password, options.realm);
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

    /**
     * Validates a given sessionId against OpenAM and adds a session listener if valid.
     *
     * @param {string} sessionId The client's OpenAM session ID
     * @return {Promise}
     */
    this.validateSession = function (sessionId) {
        return self.sessionCache.get(sessionId)
            .then(function (cached) {
                return cached;
            })
            .catch(function (err) {
                self.logger.info(err);
                return self.openAMClient.validateSession(sessionId).then(function (res) {
                    if (res.valid) {
                        self.logger.info('session %s is valid; saving to cache', sessionId);
                        self.sessionCache.put(sessionId, res);
                        if (options.notificationsEnabled) {
                            self.registerSessionListener(sessionId);
                        }
                    } else {
                        self.logger.info('session %s is invalid', sessionId);
                    }
                    return res;
                });
            });
    };

    /**
     * Fetches the user profile for a given username (uid) and saves it to the sessionCache.
     *
     * @param {string} userId The user's uid
     * @param {string} realm The user's realm
     * @param {string} sessionId The user's session ID
     * @return {Promise}
     */
    this.getUserProfile = function (userId, realm, sessionId) {
        var data = {valid: true};

        return self.sessionCache.get(sessionId)
            .then(function (cached) {
                data = cached;
                if (data && data.dn)
                    return cached;
                throw 'Profile data is missing from cache - fetching from OpenAM';
            })
            .catch(function (err) {
                self.logger.info(err);
                return self.agentSession.then(function () {
                    return self.openAMClient.getProfile(userId, realm, sessionId, self.serverInfo.cookieName).then(function (profile) {
                        // save profile to cache
                        self.sessionCache.put(sessionId, util._extend(data, profile));
                        return profile;
                    });
                });
            });
    };

    /**
     * Gets policy decisions from OpenAM for the req.originalUrl resource and the application name specified in the
     * agent config (req must be an instance of IncomingRequest).
     *
     * @param {object} params OpenAM policy request params object
     * @return {Promise}
     */
    this.getPolicyDecision = function (params) {
        return reRequest(function () {
            return self.openAMClient.getPolicyDecision(params, self.agentSession.sessionId, self.serverInfo.cookieName);
        }, 5, 'getPolicyDecision');
    };

    /**
     * Constructs a RequestSet document containing a AddSessionListener node for sessionId, and sends it to the
     * SessionService.
     *
     * @param {string} sessionId The user's session ID
     * @return {Promise}
     */
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
                    'URL': options.appUrl + notificationUrl,
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

    /**
     * Initializes the shield and returns an express middleware function that evaluates the shield.
     *
     * @param {Shield} shield Shield implementation
     * @return {Function}
     *
     * @example
     * var agent = new PolicyAgent({...}),
     *     cookieShield = new CookieShield(),
     *     app = express();
     *
     * app.use(agent.shield(cookieShield));
     *
     */
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
                    var template = swig.compileFile(options.errorTemplate || (__dirname + '/templates/error.html'));
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

    /**
     * Fetches the OpenAM server info when the agent is instantiated
     *
     * @return {object} Server info
     */
    this.serverInfo = self.openAMClient.getServerInfo().then(function (res) {
        util._extend(self.serverInfo, res);
        return res;
    });

    /**
     * The agent's own OpenAM session. It will only get created when it is needed by some request.
     *
     * @return {Promise}
     */
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

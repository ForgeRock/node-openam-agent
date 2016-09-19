var fs = require('fs'),
    events = require('events'),
    url = require('url'),
    cookie = require('cookie'),
    express = require('express'),
    bodyParser = require('body-parser'),
    shutdownHandler = require('shutdown-handler'),
    builder = require('xmlbuilder'),
    Promise = require('promise'),
    util = require('util'),
    Handlebars = require('handlebars'),
    shortid = require('shortid'),
    agentUtils = require('./utils'),
    logger = require('./logger'),
    SimpleCache = require('./cache/simpleCache').SimpleCache,
    OpenAMClient = require('./openam').OpenAMClient;

/**
 * @constructor
 *
 * @mixes {events~EventEmitter}
 *
 * @param {object} options
 * @param {string} options.serverUrl The deployment URI of the OpenAM server, e.g. http://openam.example.com:8080/openam
 * @param {string} options.username Agent username (needed for certain operations, e.g. policy decision requests)
 * @param {string} options.password Agent password (needed for certain operations, e.g. policy decision requests)
 * @param {string} options.realm=/ Agent realm (needed for certain operations, e.g. policy decision requests)
 * @param {string} [options.appUrl] The root URL of the application, e.g. http://app.example.com:8080
 * (required for notifications)
 * @param {function} options.errorPage Callback function; If present, the function's return value will be sent as an
 * error page, otherwise the default error template will be used. The function will be called with a context object as
 * the argument.
 * @param {winston~Logger} [options.logger=new Logger()] A winstonjs logger instance. If undefined, a new Console logger
 * is created.
 * @param {string} [options.logLevel=error] logging level: see winston's documentation; only used when logger is
 * undefined.
 * @param {Cache} [options.sessionCache] Custom session cache object (if undefined, a SimpleCache instance will be
 * created with an expiry time of 5 minutes)
 * @param {OpenAMClient|*} [options.openAMClient=new OpenAMClient()] Custom OpenAMClient object (mostly for testing
 * purposes)
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
    var self = this;
    options.serverUrl = (options.serverUrl || '').replace(/\/$/, '');

    /**
     * Config options
     * @type {object}
     */
    this.options = options;

    /**
     * Short random ID that lets you differentiate agents in logs, etc.
     * @type {string}
     */
    this.id = shortid.generate();

    /**
     * Built in routes (cdsso, notifications)
     * @type {object}
     */
    this.paths = {
        notifications: '/agent/notifications',
        cdsso: '/agent/cdsso'
    };

    /**
     * OpenAM client used by the agent and its shields
     * @type {*|OpenAMClient}
     */
    this.openAMClient = options.openAMClient || new OpenAMClient(options.serverUrl);

    /**
     * Logger
     * @type {winston~Logger|*}
     */
    this.logger = options.logger || logger(options.logLevel, this.id);

    /**
     * Session cache
     * @type {*|SimpleCache}
     */
    this.sessionCache = options.sessionCache || new SimpleCache({expireAfterSeconds: 300, logger: this.logger});

    /**
     * Empty Promise (Server info is loaded when init() is called)
     *
     * @type {Promise}
     */
    this.serverInfo = Promise.resolve();

    /**
     * The agent's own OpenAM session. It will only get created when it is needed by some request.
     *
     * @type {Promise}
     */
    this.agentSession = Promise.resolve();

    /**
     * Compiled Handlebars error page template
     * @type {function}
     */
    this.errorTemplate = options.errorPage || Handlebars.compile(fs.readFileSync(__dirname + '/templates/error.hdbs').toString());

    // init
    if (!options.noInit) {
        self.init();
    }

    // remove session from cache when destroyed
    this.on('session', function (session) {
        if (session.state === 'destroyed') {
            self.logger.info('PolicyAgent: removing destroyed session from cache: %s', session.sid);
            self.sessionCache.remove(session.sid);
        }
    });

    // destroy agent session on exit
    shutdownHandler.on('exit', function (e) {
        if (self.agentSession.sessionId) {
            e.preventDefault();
            self.logger.info('PolicyAgent: destroying agent session %s', self.agentSession.sessionId);
            self.openAMClient
                .logout(self.agentSession.sessionId)
                .finally(process.exit);
        }
    });
}

// turn this into an event emitter
util.inherits(PolicyAgent, events.EventEmitter);

/**
 * Initializes the agent (gets server info)
 */
PolicyAgent.prototype.init = function () {
    var self = this;

    if (typeof self.options.serverUrl !== 'string')
        throw new Error('missing serverUrl');

    this.serverInfo = self.openAMClient.getServerInfo().then(function (res) {
        util._extend(self.serverInfo, res);
        return res;
    });

    self.logger.info('Agent initialized.');
};

/**
 * Runs a request-promise type function several times if it fails with a 401 status code;
 * creates a new agent session before sending the request again
 *
 * @param {function} reqFn Function that returns a Promise
 * @param {number} attempts Number of attempts to retry the function; default: 0 (no retries)
 * @param {string} [name] Name
 *
 * @return {Promise}
 */
PolicyAgent.prototype.reRequest = function (reqFn, attempts, name) {
    var self = this,
        attemptCount = 0;
    return self.agentSession.then(reqFn).catch(function (err) {
        if (err.statusCode === 401 && attemptCount < (attempts || 0)) {
            attemptCount++;
            self.logger.info('%s: HTTP 401; retrying after authenticating the agent (attempt %s)', name || 'reRequest',
                attemptCount);
            return self.authenticateAgent().then(reqFn);
        } else {
            throw err;
        }
    });
};

/**
 * Authenticates the policy agent using the credentials in the config object.
 *
 * @return {Promise}
 */
PolicyAgent.prototype.authenticateAgent = function () {
    var self = this;

    return self.agentSession = self.serverInfo
        .then(function () {
            return self.openAMClient.authenticate(self.options.username, self.options.password, self.options.realm);
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
PolicyAgent.prototype.validateSession = function (sessionId) {
    var self = this;

    return this.sessionCache.get(sessionId)
        .then(function (cached) {
            return cached;
        })
        .catch(function (err) {
            self.logger.info(err);
            return self.openAMClient.validateSession(sessionId).then(function (res) {
                if (res.valid) {
                    self.logger.info('session %s is valid; saving to cache', sessionId);
                    self.sessionCache.put(sessionId, res);
                    if (self.options.notificationsEnabled) {
                        self.registerSessionListener(sessionId);
                    }
                } else {
                    self.logger.info('PolicyAgent: session %s is invalid', sessionId);
                }
                return res;
            });
        });
};

/**
 * Sets the session cookie on the response
 *
 * @param {express~Response} res Express Response
 * @param {string} sessionId OpenAM Session ID
 */
PolicyAgent.prototype.setSessionCookie = function (res, sessionId) {
    return this.serverInfo.then(function (serverInfo) {
        res.append('Set-Cookie', cookie.serialize(serverInfo.cookieName, sessionId, {path: '/'}));
    });
};


/**
 * Gets the session ID from the session cookie in the request
 *
 * @param {express~Response} req Express Request
 * @return {Promise} Session ID
 */
PolicyAgent.prototype.getSessionIdFromRequest = function (req) {
    var self = this;
    return this.serverInfo.then(function (serverInfo) {
        var cookies = cookie.parse(req.headers.cookie || ''),
            sessionId = cookies[serverInfo.cookieName];
        self.logger.info('PolicyAgent: found sessionId %s in request cookie %s', sessionId, serverInfo.cookieName);
        return sessionId;
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
PolicyAgent.prototype.getUserProfile = function (userId, realm, sessionId) {
    var self = this,
        data = {valid: true};

    return this.sessionCache.get(sessionId)
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
PolicyAgent.prototype.getPolicyDecision = function (params) {
    var self = this;

    return this.reRequest(function () {
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
PolicyAgent.prototype.registerSessionListener = function (sessionId) {
    var self = this;

    return this.reRequest(function () {
        var sessionRequest = builder
            .create({
                SessionRequest: {
                    '@vers': '1.0',
                    '@reqid': shortid.generate(),
                    '@requester': new Buffer('token:' + self.agentSession.sessionId).toString('base64')
                }
            })
            .ele('AddSessionListener')
            .ele({
                'URL': self.options.appUrl + self.paths.notifications,
                'SessionID': sessionId
            })
            .end();

        var requestSet = builder
            .create({
                RequestSet: {
                    '@vers': '1.0',
                    '@svcid': 'Session',
                    '@reqid': shortid.generate()
                }
            })
            .ele('Request')
            .cdata(sessionRequest)
            .end();

        return self.validateSession(self.agentSession.sessionId)
            .then(function (res) {
                // this hack is needed because the sessionservice is stupid and returns 200 even if there is an error...
                if (!res.valid)
                    throw {statusCode: 401};
                return self.openAMClient.sessionServiceRequest(requestSet);
            })
            .then(function () {
                self.logger.info('PolicyAgent: registered session listener for %s', sessionId);
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
PolicyAgent.prototype.shield = function (shield) {
    var self = this;
    shield.init(this);

    return function (req, res, next) {
        function success(sessionKey, sessionData) {
            if (sessionKey)
                req.session = util._extend({
                    key: sessionKey,
                    data: sessionData
                }, req.session);
            next();
        }

        function fail(status, message, details) {
            // handle response if unhandled
            if (!res.headersSent) {
                res.status(status || 403).send(self.errorTemplate({
                    status: status,
                    message: message,
                    details: details,
                    pkg: JSON.parse(fs.readFileSync(__dirname + '/../package.json'))
                }));
            }
        }

        if (agentUtils.contains(self.paths, req.originalUrl)) {
            success();
        } else {
            shield.evaluate(req, success, fail);
        }
    }
};

/**
 * @description
 * Expressjs Router factory which handles CDSSO (parses the LARES data and sets the session cookie)
 *
 * Note that in order for CDSSO to work, you must have the following:
 * - An agent profile in OpenAM of type "WebAgent" with all alternative app URLs listed in the "Agent Root URL for
 * CDSSO" (agentRootURL) property
 * - The cdsso middleware mounted to the express application
 * - A CookieShield mounted to a path with the cdsso option set to true
 *
 * @param {string} [path=/agent/cdsso] The path of the CDSSO endpoint
 *
 * @return {expess~Router} Express middleware
 *
 * @example
 * var openamAgent = require('openam-agent'),
 *     agent = new openamAgent.PolicyAgent({...}),
 *     app = require('express')();
 *
 * app.use(agent.cdsso('/my/cdsso/path));
 * app.get('/', new openamAgent.CookieShield(cdsso: true));
 */
PolicyAgent.prototype.cdsso = function (path) {
    var self = this,
        router = express.Router();

    this.paths.cdsso = path = path || this.paths.cdsso;

    router.post(path, bodyParser.urlencoded({extended: false}), function (req, res) {

        function success() {
            res.redirect(req.query.goto || '/');
        }

        function fail(err) {
            self.logger.error(err);

            res.status(403).send(self.errorTemplate({
                status: 401,
                message: 'Unauthorized',
                details: err.stack,
                pkg: JSON.parse(fs.readFileSync(__dirname + '/../package.json'))
            }));
        }

        if (req.body && req.body.LARES) {
            self.logger.info('Found LARES data; validating CDSSO Assertion.');
            self.getSessionIdFromLARES(req.body.LARES)
                .then(function (sessionId) {
                    self.logger.info('CDSSO Assertion validated. Setting cookie for session %s', sessionId);
                    return self.setSessionCookie(res, sessionId);
                })
                .then(success)
                .catch(fail);
        } else {
            fail();
        }
    });

    return router;
};

/**
 * Parses the LARES response (CDSSO Assertion) and returns the Session ID if valid
 *
 * @param {string} lares LARES form parameter
 * @return {Promise} Session ID
 */
PolicyAgent.prototype.getSessionIdFromLARES = function (lares) {
    // decode base64 string
    var self = this,
        buffer = new Buffer(lares, 'base64');

    return agentUtils.parseXml(buffer.toString()).then(function (doc) {
        var assertion = doc['lib:AuthnResponse']['saml:Assertion'][0],
            conditions = assertion['saml:Conditions'][0],
            nameId = assertion['saml:AuthenticationStatement'][0]['saml:Subject'][0]['saml:NameIdentifier'][0],
            now = new Date(),
            notBefore = new Date(conditions.$.NotBefore),
            notOnOrAfter = new Date(conditions.$.NotOnOrAfter);

        // check Issuer
        if (assertion.$.Issuer !== self.options.serverUrl + '/cdcservlet')
            throw 'Unknown issuer: ' + assertion.$.Issuer;

        // check AuthnResponse dates
        if (now < notBefore || now >= notOnOrAfter)
            throw 'The CDSSO Assertion is not in date: ' + notBefore + ' - ' + notOnOrAfter;

        return nameId._;
    });
};

/**
 * Returns a regular login URL
 *
 * @param {express~Request} req Request
 * @return {string}
 */
PolicyAgent.prototype.getLoginUrl = function (req) {
    return this.openAMClient.getLoginUrl(agentUtils.baseUrl(req) + req.originalUrl);
};

/**
 * Returns a CDSSO login URL
 *
 * @param {express~Request} req Request
 * @return {string}
 */
PolicyAgent.prototype.getCDSSOUrl = function (req) {
    var target = agentUtils.baseUrl(req) + this.paths.cdsso + '?goto=' +
        encodeURIComponent(req.originalUrl);
    return this.openAMClient.getCDSSOUrl(target, this.options.appUrl);
};

/**
 * Parses notifications in a notification set and emits a 'session' event for each. CookieShield instances listen
 * on this event to delete any destroyed cookies from the agent's session cache.
 *
 * @param {object} notificationSet OpenAM notification set (parsed XML document)

 * @fires session
 */
PolicyAgent.prototype.sessionNotification = function (notificationSet) {
    var self = this;

    notificationSet.Notification.forEach(function (notification) {
        agentUtils.parseXml(notification).then(function (parsed) {
            self.emit('session', parsed.SessionNotification.Session[0].$);
        });
    });
};

/**
 * A express router factory for the notification receiver endpoint. It can be used as a middleware for your express
 * application. It adds a single route: /agent/notifications which can be used to receive notifications from OpenAM.
 * When a notification is received, its contents will be parsed and handled by one of the handler functions.
 *
 * @param {string} [path=/agent/notifications] The path of the notification endpoint
 *
 * @return {express~Router}
 *
 * @example
 * var app = require('express')(),
 *     agent = require('openam-agent').policyAgent(options);
 *
 * app.use(agent.notifications('/my/notification/path'));
 */
PolicyAgent.prototype.notifications = function (path) {
    var self = this,
        router = express.Router();

    this.paths.notifications = path = path || this.paths.notifications;
    this.options.notificationsEnabled = true;

    router.post(path, bodyParser.text({type: 'text/xml'}), function (req, res) {
        self.logger.silly('PolicyAgent: notification received:\n%s', req.body);
        res.send();
        agentUtils.parseXml(req.body)
            .then(function (parsed) {
                switch (parsed.NotificationSet.$.svcid) {
                    case 'session':
                        self.sessionNotification(parsed.NotificationSet);
                        break;
                    default:
                        self.logger.error('PolicyAgent: unknown notification type %s', parsed.NotificationSet.$.svcid)
                }
            })
            .catch(function (err) {
                self.logger.error('PolicyAgent: %s', err.stack);
            });
    });

    return router;
};

module.exports.PolicyAgent = PolicyAgent;

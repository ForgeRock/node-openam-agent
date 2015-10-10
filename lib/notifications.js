var util = require('util'),
    events = require('events'),
    express = require('express'),
    bodyParser = require('body-parser'),
    Promise = require('promise'),
    xml2js = require('xml2js'),
    logger = require('./logger'),
    agentUtils = require('./utils');

/**
 * Handles notifications
 * @param {object} [options] Options
 * @param {winston~Logger|Logger} [options.logger=new Logger()] Logger
 *
 * @constructor
 */
function NotificationHandler(options) {
    var self = this;

    /**
     * Parses notifications in a notification set and emits a 'session' event for each. CookieShield instances listen
     * on this event to delete any destroyed cookies from the agent's session cache.
     *
     * @param {object} notificationSet OpenAM notification set (parsed XML document)
     * @fires session
     *
     * @example
     * app.use(agent.notifications.router);
     *   agent.notifications.on('session', function (session) {
     *   console.log('server - session changed: %s', JSON.stringify(session));
     * });
     */
    this.sessionNotification = function (notificationSet) {
        notificationSet.Notification.forEach(function (notification) {
            agentUtils.parseXml(notification)
                .then(function (parsed) {
                    self.emit('session', parsed.SessionNotification.Session[0].$);
                });
        });
    };

    /**
     * A express router for the notification receiver endpoint. It can be used as a middleware for your express
     * application. It adds a single route: /agent/notifications which can be used to receive notifications from OpenAM.
     * When a notification is received, its contents will be parsed and handled by one of the handler functions.
     *
     * @type {express~Router}
     *
     * @example
     * var app = require('express')(),
     *     agent = new (require('openam-agent').PolicyAgent)({...});
     *
     * app.use(agent.notifications)
     */
    this.router = express.Router();

    /**
     * Logger
     *
     * @type {winston~Logger|Logger}
     */
    this.logger = options && options.logger ? options.logger : logger();

    this.router.use('/agent/notification', bodyParser.text({type: 'text/xml'}), function (req, res) {
        res.send('OK');
        agentUtils.parseXml(req.body)
            .then(function (parsed) {
                switch (parsed.NotificationSet.$.svcid) {
                    case 'session':
                        self.sessionNotification(parsed.NotificationSet);
                        break;
                    default:
                        self.logger.error('unknown notification type %s', parsed.$.svcid)
                }
            })
            .catch(function (err) {
                self.logger.error(err);
            });
    });
}

util.inherits(NotificationHandler, events.EventEmitter);

module.exports.NotificationHandler = NotificationHandler;

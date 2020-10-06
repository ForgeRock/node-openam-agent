import * as BodyParser from 'body-parser';
import * as cookie from 'cookie';
import { EventEmitter } from 'events';
import { RequestHandler, Response, Router } from 'express';
import { NextFunction } from 'express-serve-static-core';
import * as fs from 'fs';
import * as Handlebars from 'handlebars';
import { IncomingMessage, ServerResponse } from 'http';
import { resolve } from 'path';
import * as ShortId from 'shortid';
import { Logger } from 'winston';
import * as XMLBuilder from 'xmlbuilder';

import { AmClient } from '../amclient/am-client';
import { AmPolicyDecision } from '../amclient/am-policy-decision';
import { AmPolicyDecisionRequest } from '../amclient/am-policy-decision-request';
import { AmServerInfo } from '../amclient/am-server-info';
import { Cache } from '../cache/cache';
import { InMemoryCache } from '../cache/in-memory-cache';
import { InvalidSessionError } from '../error/invalid-session-error';
import { Shield } from '../shield/shield';
import { baseUrl, sendResponse } from '../utils/http-utils';
import { createLogger } from '../utils/logger';
import { parseXml } from '../utils/xml-utils';
import { EvaluationErrorDetails, PolicyAgentOptions } from './policy-agent-options';

const pkg = require('../../package.json');

export const SESSION_EVENT = 'session';
export const CDSSO_PATH = '/agent/cdsso';
export const NOTIFICATION_PATH = '/agent/notifications';

/**
 * Policy Agent
 *
 * @example
 * import express from 'express';
 * import {PolicyAgent, CookieShield} from '@forgerock/openam-agent';
 *
 * const config = {
 *    serverUrl: 'http://openam.example.com:8080/openam',
 *    appUrl: 'http://app.example.com:8080',
 *    notificationsEnabled: true,
 *    username: 'my-agent',
 *    password: 'changeit',
 *    realm: '/',
 *    logLevel: 'info',
 *    errorPage: ({status, message, details}) => `<html><body><h1>${status} - ${message }</h1></body></html>`
 * };
 *
 * const agent = new PolicyAgent(config);
 * const app = express();
 *
 * app.use(agent.shield(new CookieShield()));
 * app.use(agent.notifications);
 *
 * app.listen(8080);
 */
export class PolicyAgent extends EventEmitter {
  public readonly id = ShortId.generate();
  public amClient: AmClient;
  public logger: Logger;
  public sessionCache: Cache;

  private serverInfo?: Promise<AmServerInfo>;
  private agentSession?: Promise<{ tokenId: string }>;
  private errorTemplate: (details: EvaluationErrorDetails) => string;
  private cdssoPath = CDSSO_PATH;
  private notificationPath = NOTIFICATION_PATH;

  constructor(readonly options: PolicyAgentOptions) {
    super();

    const { openAMClient, serverUrl, privateIP, logger, logLevel, sessionCache, logAsJson } = options;

    this.logger = logger || createLogger(logLevel, this.id, { json: logAsJson });
    this.amClient = openAMClient || new AmClient(serverUrl, privateIP);
    this.sessionCache = sessionCache || new InMemoryCache({ expireAfterSeconds: 300, logger });
    this.errorTemplate = options.errorPage || this.getDefaultErrorTemplate();


    this.registerSessionExpiryHandler();
    this.registerShutdownHandler();

    this.logger.info('Agent initialized.');
  }

  /**
   * Returns the cached AM server info (cookie name & domain list)
   */
  getServerInfo(): Promise<AmServerInfo> {
    if (!this.serverInfo) {
      this.serverInfo = this.amClient.getServerInfo();
    }

    return this.serverInfo;
  }

  /**
   * Returns a cached agent session
   */
  getAgentSession(): Promise<{ tokenId: string }> {
    if (!this.agentSession) {
      this.agentSession = this.authenticateAgent();
    }

    return this.agentSession;
  }

  /**
   * Creates a new agent session
   */
  authenticateAgent() {
    const { username, password, realm } = this.options;

    if (!username || !password) {
      throw new Error('PolicyAgent: agent username and password must be set');
    }

    return this.amClient
      .authenticate(username, password, realm)
      .then(res => {
        this.logger.info(`PolicyAgent: agent session created – ${res.tokenId}`);
        return res;
      });
  }

  /**
   * Retry sending a request a specified number of times. If the response status is 401, renew the agent session
   */
  async reRequest<T = any>(request: () => Promise<T>, attemptLimit = 1, name: string = 'reRequest'): Promise<T> {
    let attemptCount = 0;

    while (attemptCount < attemptLimit) {
      try {
        return await request();
      } catch (err) {
        attemptCount++;
        this.logger.debug(`PolicyAgent: ${name} - caught error ${err.message}`);
        this.logger.info(`PolicyAgent: ${name} - retrying request - attempt ${attemptCount} of ${attemptLimit}`);
        // renew agent session on 401 response
        if (err instanceof InvalidSessionError || err.statusCode === 401 || err.code === 401 ||
          (err.response && err.response.status === 401)) {
          this.agentSession = this.authenticateAgent();
          await this.agentSession;
        } else if (attemptCount === attemptLimit) {
          throw err;
        }
      }
    }
  }

  async validateSession(sessionId: string): Promise<any> {
    try {
      return await this.sessionCache.get(sessionId);
    } catch (err) {
      this.logger.info(err);
    }

    const res = await this.amClient.validateSession(sessionId);

    if (res.valid) {
      this.logger.info(`PolicyAgent: session ${sessionId} is valid; saving to cache`);
      this.sessionCache.put(sessionId, res);

      if (this.options.notificationsEnabled) {
        this.registerSessionListener(sessionId);
      }
    } else {
      this.logger.info(`PolicyAgent: session ${sessionId} is invalid`);
    }

    return res;
  }

  /**
   * Sets the session cookie on the response in a set-cookie header
   */
  async setSessionCookie(res: Response, sessionId: string): Promise<void> {
    const { cookieName } = await this.getServerInfo();
    res.append('Set-Cookie', cookie.serialize(cookieName, sessionId, { path: '/' }));
  }

  /**
   * Gets the session ID from the session cookie in the request
   */
  async getSessionIdFromRequest(req: IncomingMessage): Promise<string> {
    const { cookieName } = await this.getServerInfo();
    const cookies = cookie.parse(req.headers.cookie || '');
    const sessionId = cookies[ cookieName ];

    if (sessionId) {
      this.logger.info(`PolicyAgent: found sessionId ${sessionId} in request cookie ${cookieName}`);
    } else {
      this.logger.info(`PolicyAgent: missing session ID in request cookie ${cookieName}`);
    }

    return sessionId;
  }

  /**
   * Fetches the user profile for a given username (uid) and saves it to the sessionCache.
   */
  async getUserProfile(userId: string, realm: string, sessionId: string): Promise<any> {
    try {
      const cached = await this.sessionCache.get(sessionId);

      if (cached && cached.dn) {
        return cached;
      }
    } catch (err) {
      this.logger.info(err);
    }

    this.logger.info('PolicyAgent: profile data is missing from cache - fetching from OpenAM');

    const { cookieName } = await this.getServerInfo();
    await this.getAgentSession();

    const profile = this.amClient.getProfile(userId, realm, sessionId, cookieName);
    this.sessionCache.put(sessionId, { ...profile, valid: true });

    return profile;
  }

  /**
   * Gets policy decisions from OpenAM. The application name specified in the agent config.
   */
  async getPolicyDecision(data: AmPolicyDecisionRequest): Promise<AmPolicyDecision[]> {
    const { cookieName } = await this.getServerInfo();
    const { tokenId } = await this.getAgentSession();
    return this.reRequest<AmPolicyDecision[]>(
      () => this.amClient.getPolicyDecision(data, tokenId, cookieName, this.options.realm),
      5,
      'getPolicyDecision'
    );
  }

  /**
   * Initializes the shield and returns a middleware function that evaluates the shield.
   *
   * @example
   * const agent = new PolicyAgent(config);
   * const cookieShield = new CookieShield({getProfiles: true});
   *
   * // Express
   * const app = express();
   * app.use(agent.shield(cookieShield));
   * app.listen(3000);
   *
   * // Vanilla Node.js
   * const server = http.createServer(function (req, res) {
   *      var middleware = agent.shield(shield);
   *
   *      if (req.url.match(/some\/path$/) {
   *          middleware(req, res, function () {
   *              res.writeHead(200);
   *              res.write('Hello ' + req.session.data.username);
   *              res.end();
   *          });
   *      }
   * });
   * server.listen(3000);
   */
  shield(shield: Shield): RequestHandler {
    return async (req: IncomingMessage, res: ServerResponse, next: NextFunction) => {
      try {
        const session = await shield.evaluate(req, res, this);
        req[ 'session' ] = { ...req[ 'session' ], ...session };
        next();
      } catch (err) {
        this.logger.info('PolicyAgent#shield: evaluation error (%s)', err.message);

        if (this.options.letClientHandleErrors) {
          next(err);
          return;
        }

        // only send the response if it hasn't been sent yet
        if (res.headersSent) {
          return;
        }

        const body = this.errorTemplate({
          status: err.statusCode,
          message: err.message,
          details: err.stack,
          pkg
        });

        sendResponse(res, err.statusCode || 500, body, { 'Content-Type': 'text/html' });
      }
    };
  }

  /**
   * Express.js Router factory which handles CDSSO (parses the LARES data and sets the session cookie)
   *
   * Note that in order for CDSSO to work, you must have the following:
   * - An agent profile in OpenAM of type "WebAgent" with all alternative app URLs listed in the "Agent Root URL for
   * CDSSO" (agentRootURL) property
   * - The cdsso middleware mounted to the express application
   * - A CookieShield mounted to a path with the cdsso option set to true

   * @example
   * const openamAgent = require('openam-agent'),
   *     agent = new openamAgent.PolicyAgent({...}),
   *     app = require('express')();
   *
   * app.use(agent.cdsso('/my/cdsso/path'));
   * app.get('/', new openamAgent.CookieShield(cdsso: true));
   */
  cdsso(path = CDSSO_PATH) {
    this.cdssoPath = path;
    const router = Router();

    const fail = (err: Error, res: Response) => {
      this.logger.error(err.message, err);

      const body = this.errorTemplate({
        status: 401,
        message: 'Unauthorized',
        details: err.stack,
        pkg
      });

      res.status(403).send(body);
    };

    router.post(path, BodyParser.urlencoded({ extended: false }), async (req, res) => {
      if (!(req.body && req.body.LARES)) {
        fail(new Error('PolicyAgent: missing LARES'), res);
        return;
      }

      this.logger.info('PolicyAgent: found LARES data; validating CDSSO Assertion.');

      try {
        const sessionId = await this.getSessionIdFromLARES(req.body.LARES);
        this.logger.info(`PolicyAgent: CDSSO Assertion validated. Setting cookie for session ${sessionId}`);
        await this.setSessionCookie(res, sessionId);
        res.redirect(req.query.goto?.toString() ?? '/');
      } catch (err) {
        fail(err, res);
      }
    });

    return router;
  }

  /**
   * Parses the LARES response (CDSSO Assertion) and returns the Session ID if valid
   */
  async getSessionIdFromLARES(lares: string): Promise<string> {
    const buffer = Buffer.from(lares, 'base64');
    const doc: any = await parseXml(buffer.toString());

    const assertion = doc[ 'lib:AuthnResponse' ][ 'saml:Assertion' ][ 0 ];
    const conditions = assertion[ 'saml:Conditions' ][ 0 ];
    const nameId = assertion[ 'saml:AuthenticationStatement' ][ 0 ][ 'saml:Subject' ][ 0 ][ 'saml:NameIdentifier' ][ 0 ];
    const now = new Date();
    const notBefore = new Date(conditions.$.NotBefore);
    const notOnOrAfter = new Date(conditions.$.NotOnOrAfter);

    // check Issuer
    if (assertion.$.Issuer !== this.options.serverUrl + '/cdcservlet') {
      throw new Error('Unknown issuer: ' + assertion.$.Issuer);
    }

    // check AuthnResponse dates
    if (now < notBefore || now >= notOnOrAfter) {
      throw new Error(`The CDSSO Assertion is not in date: ${notBefore} -  ${notOnOrAfter}`);
    }

    return nameId._;
  }

  /**
   * Returns a regular login URL
   */
  getLoginUrl(req: IncomingMessage): string {
    return this.amClient.getLoginUrl(baseUrl(req) + req.url, this.options.realm);
  }

  /**
   * Returns a CDSSO login URL
   */
  getCDSSOUrl(req: IncomingMessage): string {
    const target = baseUrl(req) + CDSSO_PATH + '?goto=' + encodeURIComponent(req.url || '');
    return this.amClient.getCDSSOUrl(target, this.options.appUrl || '');
  }

  /**
   * A express router factory for the notification receiver endpoint. It can be used as a middleware for your express
   * application. It adds a single route: /agent/notifications which can be used to receive notifications from OpenAM.
   * When a notification is received, its contents will be parsed and handled by one of the handler functions.
   *
   * @example
   * var app = require('express')(),
   *     agent = require('openam-agent').policyAgent(options);
   *
   * app.use(agent.notifications('/my/notification/path'));
   */
  notifications(path = NOTIFICATION_PATH) {
    this.notificationPath = path;
    this.options.notificationsEnabled = true;

    const router = Router();

    router.post(path, BodyParser.text({ type: 'text/xml' }), async (req, res) => {
      this.logger.debug(`PolicyAgent: notification received: \n ${req.body}`);

      res.send();

      try {
        const xml = await parseXml(req.body);
        const { svcid } = xml.NotificationSet.$;

        if (svcid === 'session') {
          this.sessionNotification(xml.NotificationSet);
        } else {
          this.logger.error(`PolicyAgent: unknown notification type ${svcid}`);
        }
      } catch (err) {
        this.logger.error(`PolicyAgent: ${err.message}`, err);
      }
    });

    return router;
  }

  /**
   * Parses notifications in a notification set and emits a 'session' event for each. CookieShield instances listen
   * on this event to delete any destroyed cookies from the agent's session cache.
   * @fires 'session'
   */
  sessionNotification(notificationSet: any): void {
    notificationSet.Notification.forEach(async notification => {
      const xml = await parseXml(notification);
      this.emit(SESSION_EVENT, xml.SessionNotification.Session[ 0 ].$);
    });
  }

  /**
   * Cleans up after the agent (closes the cache and logs out the agent)
   */
  async destroy() {
    // destroy the session
    if (this.agentSession) {
      const { tokenId } = await this.getAgentSession();
      this.logger.info(`PolicyAgent: destroying agent session ${tokenId}`);

      const { cookieName } = await this.getServerInfo();

      try {
        await this.amClient.logout(tokenId, cookieName, this.options.realm);
      } catch {
        // ignore
      }
    }

    // destroy the cache
    try {
      await this.sessionCache.quit();
    } catch {
      // ignore
    }
  }

  /**
   * Constructs a RequestSet document containing a AddSessionListener node for sessionId, and sends it to the
   * SessionService.
   */
  protected registerSessionListener(sessionId: string): Promise<void> {
    return this.reRequest(async () => {
      const { tokenId } = await this.getAgentSession();
      const sessionRequest = XMLBuilder
        .create({
          SessionRequest: {
            '@vers': '1.0',
            '@reqid': ShortId.generate(),
            '@requester': Buffer.from(`token: ${tokenId}`).toString('base64')
          }
        })
        .ele('AddSessionListener')
        .ele({
          'URL': this.options.appUrl + this.notificationPath,
          'SessionID': sessionId
        })
        .end();

      const requestSet = XMLBuilder
        .create({
          RequestSet: {
            '@vers': '1.0',
            '@svcid': 'Session',
            '@reqid': ShortId.generate()
          }
        })
        .ele('Request')
        .cdata(sessionRequest)
        .end();

      const res = await this.validateSession(tokenId);

      // this hack is needed because the SessionService is stupid and returns 200 even if there is an error...
      if (!res.valid) {
        throw new InvalidSessionError();
      }

      await this.amClient.sessionServiceRequest(requestSet);
      this.logger.info('PolicyAgent: registered session listener for %s', sessionId);
    }, 5, 'registerSessionListener');
  }


  /**
   * Registers a handler for expired session events to remove any expired sessions from the cache
   */
  protected registerSessionExpiryHandler() {
    this.on(SESSION_EVENT, session => {
      if (session.state === 'destroyed') {
        this.logger.info('PolicyAgent: removing destroyed session from cache: %s', session.sid);
        this.sessionCache.remove(session.sid);
      }
    });
  }

  /**
   * Registers a process exit hook to call destroy() before exiting
   * Shutdown-handler registers hooks when it's required, which causes the tests to hang
   */
  protected registerShutdownHandler() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    require('shutdown-handler').on('exit', async (event: { preventDefault: () => void }) => {
      event.preventDefault();
      await this.destroy();
      process.exit();
    });
  }

  /**
   * Compiles the default error page with Handlebars.js
   */
  protected getDefaultErrorTemplate(): (options: any) => string {
    return Handlebars.compile(fs.readFileSync(resolve(__dirname, '../templates/error.handlebars')).toString());
  }
}

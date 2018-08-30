import { IncomingMessage, ServerResponse } from 'http';

import { ShieldEvaluationError } from '../error/shield-evaluation-error';
import { PolicyAgent } from '../policyagent/policy-agent';
import { Deferred } from '../utils/deferred';
import { redirect } from '../utils/http-utils';
import { SessionData } from './session-data';
import { Shield } from './shield';

export interface CookieShieldOptions {
  /**
   *  If true, the agent will not redirect to OpenAM's login page for authentication, only return a 401 response
   */
  noRedirect?: boolean;

  /**
   * If true, the agent will fetch and cache the user's profile when validating the session
   */
  getProfiles?: boolean;

  /**
   * If true, the shield will not enforce valid sessions. This is useful in conjunction with {getProfiles:true
   * when a route is public but you want fetch identity information for any logged in users.
   */
  passThrough?: boolean;

  /**
   * Enable CDSSO mode (you must also mount the agent.cdsso() middleware to your application)
   */
  cdsso?: boolean;
}

/**
 * Shield implementation for validating session cookies. This shield checks if the request contains a session cookie
 * and validates it against OpenAM. The session is cached if notifications are enabled, otherwise it's re-validated for
 * every request.
 *
 * The returned Promise is wrapped in a Deferred object. This is because in case of a redirect to login, the Promise
 * must not be resolved (if the Promise is resolved, the agent treats it as success). A redirect is neither success
 * nor failure.
 */
export class CookieShield implements Shield {
  constructor(readonly options: CookieShieldOptions = {}) {}

  async evaluate(req: IncomingMessage,
                 res: ServerResponse,
                 agent: PolicyAgent): Promise<SessionData> {

    const deferred = new Deferred<SessionData>();

    try {
      const sessionId = await agent.getSessionIdFromRequest(req);
      const sessionData = await this.handleSessionCookie(req, res, agent, sessionId);

      if (sessionData) {
        deferred.resolve({ key: sessionId, data: sessionData });
      }

      this.redirectToLogin(req, res, agent);
    } catch (err) {
      const formattedError = JSON.stringify(err, null, 2);
      agent.logger.debug('CookieShield: ', formattedError);

      if (err instanceof ShieldEvaluationError) {
        throw err;
      }

      throw new ShieldEvaluationError(
        err.statusCode || err.status || 500,
        err.name || err.message,
        `${err.stack}\n${formattedError}`
      );
    }

    return await deferred.promise;
  }

  private async handleSessionCookie(req: IncomingMessage,
                                    res: ServerResponse,
                                    agent: PolicyAgent,
                                    sessionId: string): Promise<any> {
    const { valid, dn, uid, realm } = await agent.validateSession(sessionId);

    if (valid) {
      agent.logger.info(`CookieShield: ${req.url} => allow`);

      if (dn && this.options.getProfiles) {
        const profile = await agent.getUserProfile(uid, realm, sessionId);
        return { ...res, ...profile };
      }

      return res;
    }

    // pass-through: no need to enforce a valid session
    if (this.options.passThrough) {
      agent.logger.info(`CookieShield: ${req.url} => pass-through`);
      return {};
    }

    agent.logger.info(`CookieShield: ${req.url} => deny`);

    // no-redirect: return a 401 error response
    if (this.options.noRedirect) {
      throw new ShieldEvaluationError(401, 'Unauthorized', 'Invalid session');
    }

    if (!(await this.checkDomainMatch(req, agent))) {
      throw new ShieldEvaluationError(400, 'Bad Request', 'Domain mismatch');
    }
  }

  private async checkDomainMatch(req: IncomingMessage, agent: PolicyAgent): Promise<boolean> {
    if (this.options.cdsso) {
      return false;
    }

    let domainMatch = false;
    const { domains } = await agent.getServerInfo();

    for (const domain of domains) {
      if (req.headers.host.includes(domain)) {
        domainMatch = true;
        break;
      }
    }

    return domainMatch;
  }

  private redirectToLogin(req: IncomingMessage, res: ServerResponse, agent: PolicyAgent): void {
    redirect(res, this.options.cdsso ? agent.getCDSSOUrl(req) : agent.getLoginUrl(req));
  }


}

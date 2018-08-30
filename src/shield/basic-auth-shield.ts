import * as basicAuth from 'basic-auth';
import { IncomingMessage, ServerResponse } from 'http';

import { ShieldEvaluationError } from '../error/shield-evaluation-error';
import { PolicyAgent } from '../policy-agent';
import { Deferred } from '../utils/deferred';
import { sendResponse } from '../utils/http-utils';
import { SessionData } from './session-data';
import { Shield } from './shield';

export interface BasicAuthShieldOptions {
  realm?: string;
  service?: string;
  module?: string;
}

/**
 * Shield implementation for enforcing a basic auth header. The credentials in the Authorization will be sent to OpenAM.
 * No session will be created.
 */
export class BasicAuthShield implements Shield {
  constructor(readonly options: BasicAuthShieldOptions) {}


  /**
   * The returned Promise is wrapped in a Deferred object. This is because in case of a 401 challenge, the Promise
   * must not be resolved (if the Promise is resolved, the agent treats it as success). A challenge is neither success
   * nor failure.
   */
  async evaluate(req: IncomingMessage, res: ServerResponse, agent: PolicyAgent): Promise<SessionData> {
    const user = basicAuth(req);
    const deferred = new Deferred<SessionData>();

    if (user) {
      await this.authenticate(agent, user.name, user.pass);
      agent.logger.info('BasicAuthShield: %s => allow', req.url);
      deferred.resolve({ key: user.name, data: { username: user.name } });
    } else {
      agent.logger.info('BasicAuthShield: %s => unauthenticated', req.url);
      this.sendChallenge(res);
    }

    return await deferred.promise;
  }

  private sendChallenge(res: ServerResponse): void {
    sendResponse(res, 401, null, {
      'WWW-Authenticate': 'Basic realm=Authorization Required'
    });
  }

  private async authenticate(agent: PolicyAgent, username: string, password: string): Promise<any> {
    try {
      await agent.amClient.authenticate(
        username,
        password,
        this.options.realm,
        this.options.service,
        this.options.module,
        true
      );
    } catch (err) {
      throw new ShieldEvaluationError(
        err.statusCode || err.status || 500,
        err.name || err.message,
        err.stack + '\n' + JSON.stringify(err, null, 2)
      );
    }
  }

}

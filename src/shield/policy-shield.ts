import * as url from 'url';
import { IncomingMessage, ServerResponse } from 'http';
import { AmPolicyDecision, AmPolicyDecisionRequest, ShieldEvaluationError } from '..';

import { PolicyAgent } from '../policy-agent';
import { SessionData } from './session-data';
import { Shield } from './shield';

export class PolicyShield implements Shield {
  constructor(readonly applicationName: string = 'iPlanetAMWebAgentService',
              readonly pathOnly = false) {}

  async evaluate(req: IncomingMessage, res: ServerResponse, agent: PolicyAgent): Promise<SessionData> {
    const sessionId = await agent.getSessionIdFromRequest(req);
    const params = this.toDecisionParams(req, sessionId);

    agent.logger.debug(`PolicyShield: requesting policy decision for ${JSON.stringify(params, null, 2)}`);

    let decision: AmPolicyDecision[] = [];

    try {
      decision = await agent.getPolicyDecision(params);
    } catch (err) {
      throw new ShieldEvaluationError(
        err.statusCode || err.status || 500,
        err.name || err.message,
        err.stack + '\n' + JSON.stringify(err, null, 2)
      );
    }

    agent.logger.debug(`PolicyShield: got policy decision ${JSON.stringify(decision, null, 2)}`);

    if (decision[ 0 ].actions[ req.method ]) {
      agent.logger.info(`PolicyShield: ${req.url} => allow`);
      const session = req[ 'session' ] || { data: {} };
      session.data.policies = decision;
      return session;
    } else {
      agent.logger.info(`PolicyShield: ${req.url} => deny`);
      throw new ShieldEvaluationError(403, 'Forbidden', 'You are not authorized to access this resource.');
    }
  }

  toDecisionParams(req: IncomingMessage, ssoToken: string): AmPolicyDecisionRequest {
    let resourceName = req[ 'originalUrl' ] || req.url;

    if (this.pathOnly) {
      const { path } = url.parse(req.url);
      resourceName = path;
    }

    return {
      resources: [ resourceName ],
      application: this.applicationName,
      subject: { ssoToken }
    }
  }

}
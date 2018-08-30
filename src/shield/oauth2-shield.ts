import { IncomingMessage, ServerResponse } from 'http';
import { ShieldEvaluationError } from '..';
import { PolicyAgent } from '../policy-agent';
import { SessionData } from './session-data';
import { Shield } from './shield';

/**
 * Shield implementation for enforcing Oauth2 access_tokens. This Shield implementation validates an OAuth2 access_token
 * issued by OpenAM, using OpenAM's /oauth2/tokeninfo service. The access_token must be sent in an Authorization header.
 */
export class Oauth2Shield implements Shield {
  constructor(readonly realm: string = '/') {}

  async evaluate(req: IncomingMessage, res: ServerResponse, agent: PolicyAgent): Promise<SessionData> {
    const accessToken = this.getAccessTokenFromRequest(req);

    let tokenInfo: any;

    if (accessToken.length) {
      tokenInfo = await this.getTokenInfo(agent, accessToken);
    } else {
      agent.logger.info(`OAuth2Shield: ${req.url} => deny`);
      throw new ShieldEvaluationError(401, 'Unauthorized', 'Missing OAuth2 Bearer token');
    }

    agent.logger.info(`OAuth2Shield: ${req.url} => allow`);
    agent.logger.debug(JSON.stringify(tokenInfo, null, 2));

    return { key: accessToken, data: tokenInfo };
  }

  getAccessTokenFromRequest(req: IncomingMessage): string {
    const authorizationHeader = req.headers.authorization || '';
    return authorizationHeader.replace('Bearer', '').trim();
  }

  async getTokenInfo(agent: PolicyAgent, accessToken: string): Promise<any> {
    try {
      return await agent.amClient.validateAccessToken(accessToken, this.realm);
    } catch (err) {
      let message = 'Internal server error';

      try {
        message = JSON.parse(err.response.body).error_description;
      } catch (e) {
        // body is not json
      }

      throw new ShieldEvaluationError(err.response.statusCode || 500, message);
    }
  }
}

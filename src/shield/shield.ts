import { IncomingMessage, ServerResponse } from 'http';

import { PolicyAgent } from '../policy-agent';
import { SessionData } from './session-data';

export interface Shield {
  evaluate(req: IncomingMessage, res: ServerResponse, agent: PolicyAgent): Promise<SessionData>;
}

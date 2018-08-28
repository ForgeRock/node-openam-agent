import { IncomingMessage, OutgoingMessage } from 'http';
import { PolicyAgent } from './policy-agent';

export interface Shield {
  evaluate(req: IncomingMessage, res: OutgoingMessage, agent: PolicyAgent): Promise<any>;
}

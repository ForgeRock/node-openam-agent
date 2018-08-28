import { PolicyAgent } from './policy-agent';
import { Shield } from './shield';

export interface CookieShieldOptions {
  noRedirect: boolean;
  getProfiles: boolean;
  passThrough: boolean;
  cdsso: boolean;
}

export class CookieShield implements Shield {
  constructor(readonly options: CookieShieldOptions) {}

  evaluate(req, res, agent: PolicyAgent): Promise<any> {
    return undefined;
  }

}
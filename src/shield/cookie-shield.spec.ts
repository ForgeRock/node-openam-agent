import { IncomingMessage, ServerResponse } from 'http';

import { PolicyAgent } from '../policyagent/policy-agent';
import { CookieShield } from './cookie-shield';

describe('CookieShield', () => {
  let agent: PolicyAgent;
  let req: IncomingMessage;
  let res: ServerResponse;
  let cookieShield: CookieShield;

  beforeEach(() => {
    cookieShield = new CookieShield();
    res = <any>{ writeHead: jest.fn(), end: jest.fn() };
    req = <any>{ url: 'test-login-url', headers: { cookie: 'testCookie=testSession', host: 'foo.example.com' } };
    agent = new PolicyAgent({ serverUrl: 'https://openam.example.com/openam', logLevel: 'off' });

    jest.spyOn(agent, 'getServerInfo')
      .mockReturnValue(Promise.resolve({ cookieName: 'testCookie', domains: [ '.example.com' ] }));
  });

  describe('evaluate()', () => {
    it('should call success if the session is valid', async () => {
      jest.spyOn(agent, 'validateSession').mockReturnValue(Promise.resolve({ valid: true }));

      const session = await cookieShield.evaluate(req, res, agent);
      expect(session.key).toEqual('testSession');
    });

    it('should send a redirect to the proper URL if the session is invalid', done => {
      jest.spyOn(agent, 'validateSession').mockReturnValue(Promise.resolve({ valid: false }));

      let session, error;

      cookieShield.evaluate(req, res, agent)
        .then(resp => session = resp)
        .catch(err => error = err);

      setTimeout(() => {
        expect(session).toBeUndefined();
        expect(error).toBeUndefined();
        expect(res.writeHead).toHaveBeenCalledWith(302,
          { Location: 'https://openam.example.com/openam/UI/Login?goto=http%3A%2F%2Ffoo.example.comtest-login-url&realm=%2F' });
        expect(res.end).toHaveBeenCalled();
        done();
      }, 200);
    });

    it('should fail with a 401 status if the session is invalid but noRedirect is true', done => {
      jest.spyOn(agent, 'validateSession').mockReturnValue(Promise.resolve({ valid: false }));

      cookieShield.options.noRedirect = true;

      cookieShield.evaluate(req, res, agent).catch(err => {
        expect(err.statusCode).toEqual(401);
        done();
      });

    });

    it('should succeed if the session is invalid but passThrough is true', async () => {
      cookieShield.options.passThrough = true;

      jest.spyOn(agent, 'validateSession').mockReturnValue(Promise.resolve({ valid: false }));

      const session = await cookieShield.evaluate(req, res, agent);
      expect(session.data).toEqual({});
    });
  });
});

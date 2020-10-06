import { Shield } from '../shield/shield';
import { MockAxios } from '../testing/mock-axios';
import { getFixture } from '../testing/utils';
import { PolicyAgent } from './policy-agent';
import { PolicyAgentOptions } from './policy-agent-options';

describe('PolicyAgent', () => {
  let agent: PolicyAgent;
  let options: PolicyAgentOptions;

  beforeEach(() => {
    options = {
      noInit: true,
      logLevel: 'none', // suppress logs for tests
      serverUrl: 'http://openam.example.com:8080/openam',
      username: 'test',
      password: 'test'
    };

    agent = new PolicyAgent(options);
  });

  afterEach(() => {
    agent.destroy();
    MockAxios.reset();
  });

  it('should set the options', () => {
    expect(agent.options).toEqual(options);
  });

  it('should have a random ID', () => {
    expect(agent.id.match(/[a-z0-9]+/i)).not.toBeNull();
  });

  describe('getServerInfo()', () => {
    it('should get the server info via the AM client', async () => {
      const serverInfoPromise = agent.getServerInfo();

      MockAxios
        .expectOne('http://openam.example.com:8080/openam/json/serverinfo/*', 'GET')
        .respond({ data: { cookieName: 'test-cookie' } });

      MockAxios.verify();

      const serverInfo = await serverInfoPromise;

      expect(serverInfo).toEqual({ cookieName: 'test-cookie' });
    });
  });

  describe('getAgentSession()', () => {
    it('should get the server info via the AM client', async () => {
      const agentSessionPromise = agent.getAgentSession();

      MockAxios
        .expectOne('http://openam.example.com:8080/openam/json/authenticate', 'POST')
        .respond({ data: { tokenId: 'foo' } });

      MockAxios.verify();

      const agentSession = await agentSessionPromise;

      expect(agentSession).toEqual({ tokenId: 'foo' });
    });
  });

  it('should remove destroyed sessions on session events', async done => {
    const sessionData = { foo: 'bar' };

    agent.on('session', () => {
      agent.sessionCache.get('mock').catch(() => done());
    });

    await agent.sessionCache.put('mock', sessionData);
    await agent.sessionCache.get('mock').then(function (data) {
      expect(data).toEqual(sessionData);
      agent.emit('session', { state: 'destroyed', sid: 'mock' });
    });

  });

  describe('getSessionIdFromLARES()', () => {
    it('should resolve the promise with the session ID if the CDSSO Assertion (LARES) is valid', async () => {
      const lares = await getFixture('validLARES.txt');
      const sessionId = await agent.getSessionIdFromLARES(lares);
      expect(sessionId).toEqual('foo');
    });

    it('should reject the promise if the CDSSO Assertion (LARES) is invalid', async () => {
      const lares = await getFixture('expiredLARES.txt');
      let sessionId, error;

      try {
        sessionId = await agent.getSessionIdFromLARES(lares);
      } catch (err) {
        error = err;
      }

      expect(sessionId).toBeUndefined();
      expect(error).toBeTruthy();
    });
  });

  describe('shield()', () => {
    it('should call next() with the original error when letClientHandleErrors is true', done => {
      agent.options.letClientHandleErrors = true;

      const error = new Error('Boo!');
      const mockShield: Shield = {
        evaluate: async () => {
          throw error;
        }
      };

      const next = jest.fn(err => {
        expect(err).toBe(err);
        done();
      });

      const shieldMiddleware = agent.shield(mockShield);
      shieldMiddleware(<any>{}, <any>{}, next);
    });
  });

});

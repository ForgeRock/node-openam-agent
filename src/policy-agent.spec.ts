import * as fs from 'fs';
import mockAxios from './testing/mock-axios';

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
      password: 'test',
      letClientHandleErrors: true
    };

    agent = new PolicyAgent(options);
  });

  afterEach(() => {
    agent.destroy();
    mockAxios.reset();
  });

  it('should set the options', () => {
    expect(agent.options).toEqual(options);
  });

  it('should have a random ID', () => {
    expect(agent.id.match(/[a-z0-9]+/i)).not.toBeNull();
  });

  describe('serverInfo', () => {
    it('should get the server info via the AM client', async () => {
      const serverInfoPromise = agent.getServerInfo();

      mockAxios
        .expectOne('http://openam.example.com:8080/openam/json/serverinfo/*', 'GET')
        .respond({ data: { cookieName: 'test-cookie' } });

      mockAxios.verify();

      const serverInfo = await serverInfoPromise;

      expect(serverInfo).toEqual({ cookieName: 'test-cookie' });
    });
  });

  describe('agentSession', () => {
    it('should get the server info via the AM client', async () => {
      const agentSessionPromise = agent.getAgentSession();

      mockAxios
        .expectOne('http://openam.example.com:8080/openam/json/authenticate', 'POST')
        .respond({ data: { tokenId: 'foo' } });

      mockAxios.verify();

      const agentSession = await agentSessionPromise;

      expect(agentSession).toEqual({ tokenId: 'foo' });
    });
  });

  // xit('should remove destroyed sessions on session events', done => {
  //   const sessionData = { foo: 'bar' };
  //
  //   agent.on('session', () => {
  //     expect(agent.sessionCache.keyValueStore.mock).be.undefined();
  //     done();
  //   });
  //
  //   agent.sessionCache.put('mock', sessionData);
  //   agent.sessionCache.get('mock').then(function (data) {
  //     data.should.toEqual(sessionData);
  //     agent.emit('session', { state: 'destroyed', sid: 'mock' });
  //   });
  // });
  //
  // xdescribe('init', () => {
  //   it('should get the server info', () => {
  //     agent.init();
  //     stubRequest.get.should.be.calledWith(options.serverUrl + '/json/serverinfo/*');
  //   });
  // });
  //
  // xdescribe('.getSessionIdFromLARES()', () => {
  //   it('should resolve the promise with the session ID if the CDSSO Assertion (LARES) is valid', () => {
  //     let lares = fs.readFileSync(__dirname + '/resources/validLARES.txt').toString();
  //     return agent.getSessionIdFromLARES(lares)
  //       .then(function (sessionId) {
  //         expect(sessionId).toEqual('foo');
  //       });
  //   });
  //   it('should reject the promise if the CDSSO Assertion (LARES) is invalid', () => {
  //     let lares = fs.readFileSync(__dirname + '/resources/expiredLARES.txt').toString();
  //
  //     return agent.getSessionIdFromLARES(lares)
  //       .then(function (sessionId) {
  //         expect(sessionId).toEqual(null);
  //       }).catch(function (err) {
  //         expect(err).not.toEqual(undefined);
  //         expect(err).not.toEqual(null);
  //       });
  //   });
  // });
  //
  // xdescribe('.shield', () => {
  //   it('should return a function', done => {
  //     let req = {}, resp = {};
  //     let error = { message: 'Something went wrong' };
  //     let valObj = {
  //       evaluate: function (req, res) {
  //         return Promise.reject(error);
  //       }
  //     };
  //     let middlewareFunction = agent.shield(valObj);
  //     expect(middlewareFunction).be.a.function;
  //     let middleSpy = function (arg1) {
  //       expect(arg1).toEqual(error);
  //       done;
  //     };
  //     middlewareFunction(req, resp, middleSpy);
  //   });
  // });

});

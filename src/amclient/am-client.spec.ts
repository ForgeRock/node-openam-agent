import mockAxios from '../testing/mock-axios';
import { AmClient } from './am-client';

describe('AmClient', () => {
  describe('Test with private IP', () => {
    let hostname: string;
    let serverUrl: string;
    let privateIp: string;
    let amClient: AmClient;

    beforeEach(() => {

      serverUrl = 'http://openam.example.com:8080/openam';
      hostname = 'openam.example.com';
      privateIp = '127.0.0.1';
      amClient = new AmClient(serverUrl, privateIp);

    });

    afterEach(() => {
      mockAxios.reset();
    });

    describe('getServerInfo', () => {
      it('request should have private ip in url', () => {
        amClient.getServerInfo();
        expect((mockAxios.get.mock.calls[ 0 ][ 0 ].indexOf(privateIp) > -1)).toBe(true);
      });

      it('request should have header host value', () => {
        amClient.getServerInfo();
        expect(mockAxios.get.mock.calls[ 0 ][ 1 ].headers.host).toEqual(hostname);
      });
    });

    describe('authenticate', () => {
      it('request should have private ip in url', () => {
        amClient.authenticate(null, null);
        expect((mockAxios.post.mock.calls[ 0 ][ 0 ].indexOf(privateIp) > -1)).toBe(true);
      });

      it('request should have header host value', () => {
        amClient.authenticate(null, null);
        expect(mockAxios.post.mock.calls[ 0 ][ 2 ].headers.host).toEqual(hostname);
      });
    });

    describe('logout', () => {
      it('request should have private ip in url', () => {
        amClient.logout('sessionid', null);
        expect((mockAxios.post.mock.calls[ 0 ][ 0 ].indexOf(privateIp) > -1)).toBe(true);
      });

      it('request should have header host value', () => {
        amClient.logout('sessionid', null);
        expect(mockAxios.post.mock.calls[ 0 ][ 2 ].headers.host).toEqual(hostname);
      });
    });

    describe('validateSession', () => {
      it('request should have private ip in url', () => {
        amClient.validateSession('sessionid');
        expect((mockAxios.post.mock.calls[ 0 ][ 0 ].indexOf(privateIp) > -1)).toBe(true);
      });

      it('request should have header host value', () => {
        amClient.validateSession('sessionid');
        expect(mockAxios.post.mock.calls[ 0 ][ 2 ].headers.host).toEqual(hostname);
      });
    });

    describe('getPolicyDecision', () => {
      it('request should have private ip in url', () => {
        amClient.getPolicyDecision(<any>{}, 'sessionId', 'cookieName');
        expect((mockAxios.post.mock.calls[ 0 ][ 0 ].indexOf(privateIp) > -1)).toBe(true);
      });

      it('request should have header host value', () => {
        amClient.getPolicyDecision(<any>{}, 'sessionId', 'cookieName');
        expect(mockAxios.post.mock.calls[ 0 ][ 2 ].headers.host).toEqual(hostname);
      });
    });

    describe('sessionServiceRequest', () => {
      it('request should have private ip in url', () => {
        amClient.sessionServiceRequest('');
        expect((mockAxios.post.mock.calls[ 0 ][ 0 ].indexOf(privateIp) > -1)).toBe(true);
      });

      it('request should have header host value', () => {
        amClient.sessionServiceRequest('');
        expect(mockAxios.post.mock.calls[ 0 ][ 2 ].headers.host).toEqual(hostname);
      });
    });

    describe('validateAccessToken', () => {
      it('request should have private ip in url', () => {
        amClient.validateAccessToken('accessToken');
        expect((mockAxios.get.mock.calls[ 0 ][ 0 ].indexOf(privateIp) > -1)).toBe(true);
      });

      it('request should have header host value', () => {
        amClient.validateAccessToken('accessToken');
        expect(mockAxios.get.mock.calls[ 0 ][ 1 ].headers.host).toEqual(hostname);
      });

    });
    describe('getProfile', () => {
      it('request should have private ip in url', () => {
        amClient.getProfile(null, null, null, null);
        expect((mockAxios.get.mock.calls[ 0 ][ 0 ].indexOf(privateIp) > -1)).toBe(true);
      });
      it('request should have header host value', () => {
        amClient.getProfile(null, null, null, null);
        expect(mockAxios.get.mock.calls[ 0 ][ 1 ].headers.host).toEqual(hostname);
      });
    });
  });

  describe('Test without private IP', () => {
    let serverUrl;
    let amClient: AmClient;

    beforeEach(() => {
      serverUrl = 'http://openam.example.com:8080/openam';
      amClient = new AmClient(serverUrl);
    });

    afterEach(() => {
      mockAxios.reset();
    });

    describe('getServerInfo', () => {
      it('request should have serverUrl in url', () => {
        amClient.getServerInfo();
        expect((mockAxios.get.mock.calls[ 0 ][ 0 ].indexOf(serverUrl) > -1)).toBe(true);
      });

      it('request should have header host value', () => {
        amClient.getServerInfo();
        expect(mockAxios.get.mock.calls[ 0 ][ 1 ].headers.host).toBeTruthy();
      });
    });

    describe('authenticate', () => {
      it('request should have serverUrl in url', () => {
        amClient.authenticate(null, null);
        expect((mockAxios.post.mock.calls[ 0 ][ 0 ].indexOf(serverUrl) > -1)).toBe(true);
      });

      it('request should have header host value', () => {
        amClient.authenticate(null, null);
        expect(mockAxios.post.mock.calls[ 0 ][ 2 ].headers.host).toBeTruthy();
      });
    });

    describe('logout', () => {
      it('request should not have serverUrl in url', () => {
        amClient.logout('sessionid', null);
        expect((mockAxios.post.mock.calls[ 0 ][ 0 ].indexOf(serverUrl) > -1)).toBe(true);
      });

      it('request should have header host value', () => {
        amClient.logout('sessionid', null);
        expect(mockAxios.post.mock.calls[ 0 ][ 2 ].headers.host).toBeTruthy();
      });
    });

    describe('validateSession', () => {
      it('request should not have serverUrl in url', () => {
        amClient.validateSession('sessionid');
        expect((mockAxios.post.mock.calls[ 0 ][ 0 ].indexOf(serverUrl) > -1)).toBe(true);
      });

      it('request should have header host value', () => {
        amClient.validateSession('sessionid');
        expect(mockAxios.post.mock.calls[ 0 ][ 2 ].headers.host).toBeTruthy();
      });
    });

    describe('getPolicyDecision', () => {
      it('request should not have serverUrl in url', () => {
        amClient.getPolicyDecision(<any>{}, 'sessionID', 'cookieName');
        expect((mockAxios.post.mock.calls[ 0 ][ 0 ].indexOf(serverUrl) > -1)).toBe(true);
      });

      it('request should have header host value', () => {
        amClient.getPolicyDecision(<any>{}, 'sessionID', 'cookieName');
        expect(mockAxios.post.mock.calls[ 0 ][ 2 ].headers.host).toBeTruthy();
      });
    });

    describe('sessionServiceRequest', () => {
      it('request should not have serverUrl in url', () => {
        amClient.sessionServiceRequest('');
        expect((mockAxios.post.mock.calls[ 0 ][ 0 ].indexOf(serverUrl) > -1)).toBe(true);
      });

      it('request should have header host value', () => {
        amClient.sessionServiceRequest('');
        expect(mockAxios.post.mock.calls[ 0 ][ 2 ].headers.host).toBeTruthy();
      });
    });

    describe('validateAccessToken', () => {
      it('request should have serverUrl in url', () => {
        amClient.validateAccessToken('accessToken');
        expect((mockAxios.get.mock.calls[ 0 ][ 0 ].indexOf(serverUrl) > -1)).toBe(true);
      });

      it('request should have header host value', () => {
        amClient.validateAccessToken('accessToken');
        expect(mockAxios.get.mock.calls[ 0 ][ 1 ].headers.host).toBeTruthy();
      });
    });

    describe('getProfile', () => {
      it('request should have serverUrl in url', () => {
        amClient.getProfile(null, null, null, null);
        expect((mockAxios.get.mock.calls[ 0 ][ 0 ].indexOf(serverUrl) > -1)).toBe(true);
      });

      it('request should have header host value', () => {
        amClient.getProfile(null, null, null, null);
        expect(mockAxios.get.mock.calls[ 0 ][ 1 ].headers.host).toBeTruthy();
      });
    });
  });
});

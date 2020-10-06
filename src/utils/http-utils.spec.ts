import { IncomingMessage, ServerResponse } from 'http';

import { getProtocol } from './http-utils';

describe('http-utils', () => {
  let req: IncomingMessage;

  describe('getProtocol()', () => {
    it('should use https from the express protocol if present', () => {
      req = <any>{ url: 'test-login-url', headers: {}, protocol: 'https' };

      expect(getProtocol(req)).toEqual('https');
    });

    it('should use http from the express protocol if present', () => {
      req = <any>{ url: 'https://test-login-url', headers: {}, protocol: 'http' };

      expect(getProtocol(req)).toEqual('http');
    });

    it('should use https from the x-forwarded-proto header if present', () => {
      req = <any>{ url: 'test-login-url', headers: { 'x-forwarded-proto': 'https' } };

      expect(getProtocol(req)).toEqual('https');
    });

    it('should use http from the x-forwarded-proto header if present', () => {
      req = <any>{ url: 'https://test-login-url', headers: { 'x-forwarded-proto': 'http' } };

      expect(getProtocol(req)).toEqual('http');
    });

    it('should use the url protocol if present', () => {
      req = <any>{ url: 'https://test-login-url', headers: {} };

      expect(getProtocol(req)).toEqual('https');
    });

    it('should use http if no evidence of https', () => {
      req = <any>{ url: 'test-login-url', headers: {} };

      expect(getProtocol(req)).toEqual('http');
    });
  });
});

import Axios from 'axios';
import { OutgoingHttpHeaders } from 'http';
import * as shortid from 'shortid';
import * as url from 'url';

import { AmPolicyDecision } from './am-policy-decision';
import { AmPolicyDecisionRequest } from './am-policy-decision-request';
import { AmServerInfo } from './am-server-info';

/**
 * ForgeRock OpenAM / Access Management client
 * Supports OpenAM 13 and above. Policy decisions via REST are only available in 13.5 and above.
 */
export class AmClient {
  serverUrl: string;
  serverAddress: string;
  hostname?: string;

  constructor(serverUrl: string, privateIp?: string) {
    this.serverUrl = serverUrl.replace(/\/$/, '');

    if (privateIp) {
      this.hostname = url.parse(this.serverUrl).hostname || '';
      this.serverAddress = this.serverUrl.replace(this.hostname, privateIp);
    } else {
      this.serverAddress = this.serverUrl;
    }
  }

  /**
   * Gets the results of /json/serverinfo/*
   */
  getServerInfo(): Promise<AmServerInfo> {
    return Axios
      .get(
        `${this.serverAddress}/json/serverinfo/*`,
        { headers: { host: this.hostname } })
      .then(res => res.data);
  }

  /**
   * Sends an authentication request to OpenAM. Returns Promise. The module argument overrides service. The default
   * realm is /. If noSession is true, the credentials will be validated but no session will be created.
   */
  authenticate(username: string,
               password: string,
               realm = '/',
               service?: string,
               module?: string,
               noSession = false): Promise<{ tokenId: string }> {
    let authIndexType, authIndexValue;

    if (service) {
      authIndexType = 'service';
      authIndexValue = service;
    }

    if (module) {
      authIndexType = 'module';
      authIndexValue = module;
    }

    return Axios
      .post(`${this.serverAddress}/json/authenticate`, null, {
        headers: {
          host: this.hostname,
          'X-OpenAM-Username': username,
          'X-OpenAM-Password': password
        },
        params: { realm, authIndexType, authIndexValue, noSession }
      })
      .then(res => res.data);
  }

  /**
   * Sends a logout request to OpenAM to to destroy the session identified by sessionId
   */
  async logout(sessionId: string, cookieName: string, realm = '/'): Promise<any> {
    if (!sessionId) {
      return;
    }

    const headers: OutgoingHttpHeaders = {
      [ cookieName ]: sessionId,
      host: this.hostname,
      'Content-Type': 'application/json',
      'Accept-API-Version': 'resource=1.1'
    };

    return Axios
      .post(`${this.serverAddress}/json/sessions`, null, {
        headers,
        params: { realm, _action: 'logout' }
      })
      .then(res => res.data);
  }

  /**
   * Validates a given sessionId against OpenAM.
   */
  validateSession(sessionId: string): Promise<{ valid: boolean }> {
    if (!sessionId) {
      return Promise.resolve({ valid: false });
    }

    return Axios
      .post(`${this.serverAddress}/json/sessions/${sessionId}`, null, {
        params: { _action: 'validate' },
        headers: {
          'host': this.hostname,
          'Content-Type': 'application/json',
          'Accept-API-Version': 'resource=1.1'
        }
      })
      .then(res => res.data);
  }

  /**
   * Returns an OpenAM login URL with the goto query parameter set to the original URL in req.
   */
  getLoginUrl(goto?: string, realm = '/'): string {
    return this.serverUrl + url.format({
      pathname: '/UI/Login',
      query: { goto, realm }
    });
  }

  /**
   * Constructs a CDSSO login URL
   *
   * @param {string} target Target URL
   * @param {string} provider ProviderId (app URL)
   * @return {string}
   */
  getCDSSOUrl(target: string, provider: string) {
    return this.serverUrl + url.format({
      pathname: '/cdcservlet',
      query: {
        TARGET: target,
        RequestID: shortid.generate(),
        MajorVersion: 1,
        MinorVersion: 0,
        ProviderID: provider,
        IssueInstant: new Date().toISOString()
      }
    });
  }

  /**
   * Gets policy decisions from OpenAM for params. params must be a well formatted OpenAM policy request object.
   * It needs a valid sessionId and cookieName in order to make the request. (The user to whom the session belongs needs
   * to have the REST calls for policy evaluation privilege in OpenAM.
   */
  getPolicyDecision(data: AmPolicyDecisionRequest,
                    sessionId: string,
                    cookieName: string,
                    realm = '/'): Promise<AmPolicyDecision[]> {
    return Axios
      .post(`${this.serverAddress}/json/policies`, data, {
        headers: {
          [ cookieName ]: sessionId,
          host: this.hostname
        },
        params: {
          _action: 'evaluate',
          realm: realm || '/'
        }
      })
      .then(res => res.data);
  }

  /**
   * Sends requestSet to the SessionService. requestSet must be a properly formatted XML document.
   *
   * @param {object} requestSet Session service request set
   * @return {Promise} Session service response
   */
  sessionServiceRequest(requestSet: string): Promise<any> {
    return Axios
      .post(`${this.serverAddress}/sessionservice`, requestSet, {
        headers: {
          host: this.hostname,
          'Content-Type': 'text/xml'
        }
      })
      .then(res => res.data);
  }

  /**
   * Validates the OAuth2 access_token in the specified realm.
   *
   * @param {string} accessToken OAuth2 access_token
   * @param {string} [realm=/]
   * @return {Promise} Token info response
   */
  validateAccessToken(accessToken: string, realm = '/'): Promise<any> {
    return Axios
      .get(`${this.serverAddress}/oauth2/tokeninfo`, {
        headers: {
          host: this.hostname
        },
        params: {
          access_token: accessToken,
          realm
        }
      })
      .then(res => res.data);
  }

  /**
   * Gets a user's profile (requires an agent or admin session).
   */
  getProfile(userId: string, realm: string, sessionId: string, cookieName: string): Promise<any> {
    //noinspection JSValidateTypes
    return Axios
      .get(`${this.serverAddress}/json/users/${userId}`, {
        headers: {
          host: this.hostname,
          cookie: `${cookieName}=${sessionId}`
        },
        params: {
          realm: realm || '/'
        }
      })
      .then(res => res.data);
  }
}

/**
 * Alias to the old name
 * @deprecated
 */
export const OpenAMClient = AmClient;

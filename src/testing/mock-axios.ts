import { Deferred } from '../utils/deferred';

interface RequestDetails {
  deferred: Deferred;
  method: string;
  url: string;
  data?: any;
  options: any;
}

class MockAxios {
  static requests: RequestDetails[] = [];

  static get(url: string, options: any) {
    return this.request('GET', url, options);
  }

  static post(url: string, data: any, options: any) {
    return this.request('POST', url, options);
  }

  static put(url: string, data: any, options: any) {
    return this.request('PUT', url, options);
  }

  static request(method: string, url: string, options: any) {
    const deferred = new Deferred();
    this.requests.push({ deferred, url, options, method });
    return deferred.promise;

  }

  static expectOne(url: string, method?: string) {
    const matchingRequests = this.requests.filter(req =>
      method
        ? url === req.url && method === req.method
        : url === req.url
    );

    if (matchingRequests.length !== 1) {
      throw new Error(`Expected one request for ${method || ''} ${url}, found ${matchingRequests.length}`);
    }

    this.requests.splice(this.requests.indexOf(matchingRequests[ 0 ]), 1);

    return {
      respond: data => matchingRequests[ 0 ].deferred.resolve(data),
      error: error => matchingRequests[ 0 ].deferred.reject(error)
    }
  }

  static verify() {
    if (this.requests.length) {
      throw new Error(`There are outstanding requests: \n ${JSON.stringify(this.requests, null, 2)}`);
    }
  }

  static reset() {
    this.requests = [];
  }
}

export default MockAxios;

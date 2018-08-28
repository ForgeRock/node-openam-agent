/**
 * Composes and sends an HTTP response
 * @param res {http~ServerResponse} Response
 * @param statusCode {number} HTTP status code
 * @param [body] {string} Response body
 * @param [headers] {*} Headers object
 */
export function sendResponse(res, statusCode, body, headers) {
    res.writeHead(statusCode, headers);
    res.end(body);
}

/**
 * Sends a redirect response
 * @param res {http~ServerResponse} Response
 * @param location {string} Redirection URL
 * @param [permanent=false] {boolean} If true, a 301 status code is sent, otherwise 302.
 */
export function redirect(res, location, permanent) {
    sendResponse(res, permanent ? 301 : 302, null, {Location: location});
}

/**
 * Returns the origin pf the request (<protocol>://<host>)
 * @param req {http~IncomingMessage} Request
 * @return {string}
 */
export function baseUrl(req) {
    return getProtocol(req) + '://' + req.headers.host;
}

/**
 * Returns "http" or "https"
 * @param req {http~IncomingMessage} Request
 * @return {string}
 */
export function getProtocol(req) {
    return req.connection.encrypted ? 'https' : 'http';
}

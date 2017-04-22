/**
 * Composes and sends an HTTP response
 * @param res {http~ServerResponse} Response
 * @param statusCode {number} HTTP status code
 * @param [body] {string} Response body
 * @param [headers] {*} Headers object
 */
function sendResponse(res, statusCode, body, headers) {
    res.writeHead(statusCode, headers);
    res.end(body);
}

module.exports.sendResponse = sendResponse;

/**
 * Sends a redirect response
 * @param res {http~ServerResponse} Response
 * @param location {string} Redirection URL
 * @param [permanent=false] {boolean} If true, a 301 status code is sent, otherwise 302.
 */
function redirect(res, location, permanent) {
    sendResponse(res, permanent ? 301 : 302, null, {Location: location});
}

module.exports.redirect = redirect;


/**
 * Returns the origin pf the request (<protocol>://<host>)
 * @param req {http~IncomingMessage} Request
 * @return {string}
 */
function baseUrl(req) {
    return getProtocol(req) + '://' + req.headers.host;
}

module.exports.baseUrl = baseUrl;

/**
 * Returns "http" or "https"
 * @param req {http~IncomingMessage} Request
 * @return {string}
 */
function getProtocol(req) {
    return req.connection.encrypted ? 'https' : 'http';
}

module.exports.getProtocol = getProtocol;

/**
 * Returns "openam.example.com"
 * @param url {string} http://openam.example.com:8080/openam
 * @return {string}
 */
function getHostname(url) {
    var hostname;
    if (url.indexOf("://") > -1) {
        hostname = url.split('/')[2];
    }
    else {
        hostname = url.split('/')[0];    
    }

    return hostname.split(':')[0];
}

module.exports.getHostname = getHostname;

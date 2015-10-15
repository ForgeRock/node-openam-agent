var Promise = require('promise'),
    xml2js = require('xml2js');

function parseXml(doc) {
    var parser = new xml2js.Parser();
    var parseString = Promise.denodeify(parser.parseString);
    return parseString(doc);
}

module.exports.parseXml = parseXml;

function baseUrl(req) {
    return req.protocol + '://' + req.get('host');
}

module.exports.baseUrl = baseUrl;

function contains (obj, value) {
    return Object.keys(obj).reduce(function (contains, key) {
        return contains || (obj[key] === value);
    }, false)
}

module.exports.contains = contains;


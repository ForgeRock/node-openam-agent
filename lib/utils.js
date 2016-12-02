var Promise = require('bluebird'),
    xml2js = require('xml2js');

function parseXml(doc) {
    var parser = new xml2js.Parser();
    var parseString = Promise.promisify(parser.parseString);
    return parseString(doc);
}

module.exports.parseXml = parseXml;

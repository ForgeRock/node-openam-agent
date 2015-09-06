var Promise = require('promise'),
    xml2js = require('xml2js');

function parseXml(doc) {
    var parser = new xml2js.Parser();
    var parseString = Promise.denodeify(parser.parseString);
    return parseString(doc);
}

module.exports.parseXml = parseXml;

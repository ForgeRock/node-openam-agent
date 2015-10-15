var Shield = require('./shield'),
    CookieShield = require('./cookieShield').CookieShield,
    BasicAuthShield = require('./basicAuthShield').BasicAuthShield,
    OAuth2Shield = require('./oAuth2Shield').OAuth2Shield,
    PolicyShield = require('./policyShield').PolicyShield;

module.exports.Shield = Shield;

module.exports.CookieShield = CookieShield;
module.exports.cookieShield = function (options) {
    return new CookieShield(options);
};

module.exports.BasicAuthShield = BasicAuthShield;
module.exports.basicAuthShield = function (options) {
    return new BasicAuthShield(options);
};

module.exports.OAuth2Shield = OAuth2Shield;
module.exports.oAuth2Shield = function (options) {
    return new OAuth2Shield(options);
};

module.exports.PolicyShield = PolicyShield;
module.exports.policyShield = function (options) {
    return new PolicyShield(options);
};

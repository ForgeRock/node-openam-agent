var request = require('request-promise'),
    openam = require('..');

var agent = new openam.PolicyAgent({
    serverUrl: 'http://openam.example.com:8080/openam',
    username: 'passport',
    password: 'changeit',
    realm: '/',
    applicationName: 'passport'
});

var sessionId;

agent.getServerInfo()
    .then(function () {
        console.log('login demo');
        return agent.authenticate('demo', 'changeit');
    })
    .then(function (res) {
        sessionId = res.tokenId;
        console.log(res.tokenId);
        console.log('get /foo');
        return request.get('http://app.example.com:8080/foo', {
            headers: {
                cookie: agent.serverInfo.cookieName + '=' + sessionId
            }
        });
    })
    .then(function () {
        console.log('sleep 3');
        return new Promise(function (resolve) {
            setTimeout(resolve, 3000);
        });
    })
    .then(function () {
        console.log('logout demo');
        return agent.logout(sessionId);
    })
    .then(function () {
        console.log('done');
    });


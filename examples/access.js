var request = require('request-promise'),
    openam = require('..');

var openamClient = new openam.OpenAMClient('http://openam.example.com:8080/openam');

var sessionId, cookieName;

openamClient.getServerInfo()
    .then(function (res) {
        cookieName = res.cookieName;
        console.log('login demo');
        return openamClient.authenticate('demo', 'changeit', '/');
    })
    .then(function (res) {
        sessionId = res.tokenId;
        console.log(res.tokenId);
        console.log('get /foo');
        return request.get('http://app.example.com:8080/foo', {
            headers: {
                cookie: cookieName + '=' + sessionId
            }
        });
    })
    .delay(3000)
    .then(function () {
        console.log('logout demo');
        return openamClient.logout(sessionId);
    })
    .then(function () {
        console.log('done');
    });


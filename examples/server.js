var express = require('express'),
    openam = require('..');

var app = express(),
    agent = new openam.PolicyAgent({
        serverUrl: 'http://openam.example.com:8080/openam',
        appUrl: 'http://app.example.com:8080',
        notificationRoute: '/',
        notificationsEnabled: true,
        username: 'node-agent',
        password: 'changeit',
        realm: '/'
    });

// notifications
app.use(agent.notifications.router);
agent.notifications.on('session', function (session) {
    console.log('server - session changed!', session);
});

// app routes

// unprotected root path
app.get('/', function (req, res) {
    res.send('<html><body><h1>Hello world!</h1></body></html>')
});

// human visitors; use cookie based auth and policy enforcement
var cookieShield = new openam.CookieShield(),
    policyShield = new openam.PolicyShield('node-app'),
    oauth2Shield = new openam.OAuth2Shield('/'),
    basicAuthShield = new openam.BasicAuthShield({module: 'LDAP'});

app.get('/foo', agent.shield(cookieShield), agent.shield(policyShield), function (req, res) {
    res.send('<html><body><h1>FOO ' + req.session.data.uid + '!</h1></body></html>')
});
app.get('/bar', agent.shield(cookieShield), agent.shield(policyShield), function (req, res) {
    res.send('<html><body><h1>BAR ' + req.session.data.uid + '!</h1></body></html>')
});

// oauth auth for mobile devices and what not
app.get('/mobile', agent.shield(oauth2Shield), function (req, res) {
    res.send({
        message: 'hello',
        tokenInfo: req.session.data
    });
});

// basic auth for the more challenged clients
app.get('/derp', agent.shield(basicAuthShield), function (req, res) {
    res.set('content-type', 'text/plain');
    res.send('Derp!');
});

var server = app.listen(8080, function () {
    console.log('Server started on port %d', server.address().port);
});


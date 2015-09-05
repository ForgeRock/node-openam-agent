var express = require('express'),
    passport = require('passport'),
    openam = require('..');

var app = express(),
    agent = new openam.PolicyAgent({
        serverUrl: 'http://openam.example.com:8080/openam',
        appUrl: 'http://app.example.com:8080',
        notificationRoute: '/',
        notificationsEnabled: true,
        username: 'passport',
        password: 'changeit',
        realm: '/',
        applicationName: 'passport',
        ssoOnlyMode: false,
        notEnforced: []
    }),
    strategy = new openam.OpenAMStrategy(agent);

passport.use(strategy);

app.use(passport.initialize());

app.use(passport.authenticate('openam', {
    session: false
    //,noRedirect: true
}));

app.use(agent.notifications);

agent.notifications.on('session', function (session) {
    console.log('server - session changed!');
});

app.get('/', function (req, res) {
    res.send('<html><body><h1>Hello ' + req.user + '!</h1></body></html>')
});

app.get('/foo', function (req, res) {
    res.send('<html><body><h1>Foo bar ' + req.user + '!</h1></body></html>')
});

var server = app.listen(8080, function () {
    console.log('Server started on port %d', server.address().port);
});


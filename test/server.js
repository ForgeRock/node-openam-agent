var express = require('express'),
    session = require('express-session'),
    passport = require('passport'),
    OpenAMStrategy = require('..').OpenAMStrategy;

var app = express();

passport.use(new OpenAMStrategy({
    serverUrl: 'http://u14.example.com:8080/openam',
    username: 'passport',
    password: 'changeit',
    applicationName: 'passport'
}));

//app.use(session({ secret: 'keyboard cat' }));
app.use(passport.initialize({session: false}));
//app.use(passport.session());

app.use(passport.authenticate('openam', {
    session: false,
    authorize: true
    //,noRedirect: true
}));

app.get('/', function (req, res) {
    res.send('<html><body><h1>Hello ' + req.user + '!</h1></body></html>')
});

app.get('/foo', function (req, res) {
    res.send('<html><body><h1>Foo bar ' + req.user + '!</h1></body></html>')
});

var server = app.listen(8080, function () {
    console.log('Server started on port %d', server.address().port);
});

var express = require('express'),
    passport = require('passport'),
    openam = require('..');

var app = express();

//app.use(openam);
app.get('/', function (req, res) {
    res.send('<html><body><h1>Hello World!</h1></body></html>')
});

var server = app.listen(8080, function() {
    console.log('Server started on port %d', server.address().port);
});

var util = require('util'),
    EventEmitter = require('events').EventEmitter,
    notifications = require('express')(),
    bodyParser = require('body-parser'),
    Promise = require('promise'),
    xml2js = require('xml2js');

//notifications.on('session', function (session) {
//    console.log('session changed!', session);
//});

notifications.use('/agent/notification', bodyParser.text({type: 'text/xml'}), function (req, res) {
    res.send('OK');
    var parser = new xml2js.Parser(),
        parseString = Promise.denodeify(parser.parseString);
    //console.log(req.body);
    parseString(req.body)
        .then(function (parsed) {
            return parseString(parsed.NotificationSet.Notification[0]);
        })
        .then(function (parsed) {
            //{
            //    sid: "AQIC5wM2LY4Sfcy...",
            //    stype: "user",
            //    cid: "id=demo,ou=user,dc=openam,dc=forgerock,dc=org",
            //    cdomain: "dc=openam,dc=forgerock,dc=org",
            //    maxtime: "120",
            //    maxidle: "30",
            //    maxcaching: "3",
            //    timeidle: "0",
            //    timeleft: "7181",
            //    state: "destroyed"
            //}
            var session = parsed.SessionNotification.Session[0].$;
            res.app.emit('session', session);
            //console.log(session);
        })
        .catch(function (err) {
            console.log(err);
        });
});

module.exports = notifications;

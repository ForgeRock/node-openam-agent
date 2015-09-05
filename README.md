# passport-openam
OpenAM Policy Agent for expressjs and passportjs
 
## PolicyAgent and the OpenAMStrategy

Set up the express app, the agent and the passport:
```javascript
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
```

Use the authenticator middleware globally or for individual routes: 

``` javascript
app.use(passport.authenticate('openam', {
    session: false
}));

app.use('/some/api', passport.authenticate('openam', {
    session: false
    noRedirect: true
}));
```
    
## Notifications

The agent can register session change listeners. It has a `notifications` middleware you can attach to your app: 

``` javascript
app.use(agent.notifications);
```

It emits a `session` event if a session notification is received from OpenAM.

``` javascript
agent.notifications.on('session', function (session) {
    console.log('server - session changed!');
});
```

If notifications are enabled, sessions will be cached. Otherwise, sessions will be validated upon every request.

## Authorization

If `ssoOnlyMode` is set to `false`, the authenticator middleware will fetch policy decisions from OpenAM for every request.
Decisions are not cached (yet).


## PolicyAgent class

### PolicyAgent(config)
The constructor function, whose argument should be an object of config options (listed below).

``` javascript
var config = {
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
};

var agent = new PolicyAgent(config);
```

The OpenAMStrategy passport strategy only accepts a PolicyAgent instance as its initialization parameter.
 
### getServerInfo()
Gets the results of `/json/serverinfo/*` and mixes them in to `PolicyAgent.serverInfo`

### serverInfo
A Promise returned by `getServerInfo()`. Once resolved, the response is mixed into the `serverInfo` object.

### authenticate(username, password, realm)
Sends an authentication request to OpenAM. Returns `Promise`.

### authenticateAgent()
Authenticates the policy agent using the credentials in the config object. Returns `Promise`.

### logout(sessionId)
Sends a logout request to OpenAM to to destroy the session identified by `sessionId`. Returns `Promise`.

### validateSession(sessionId)
Validates a given sessionId against OpenAM. Returns `Promise`.

### getLoginUrl(req)
Returns an OpenAM login URL with the `goto` query parameter set to the original URL in `req` (`req` must be an instance 
of `IncomingRequest`). Returns `String`.

### getPolicyDecision(req)
Gets policy decisions from OpenAM for the `req.originalUrl` resource and the application name specified in the agent 
config (`req` must be an instance of `IncomingRequest`). Returns `Promise`.

### sessionServiceRequest(requestSet)
Sends `requestSet` to the SessionService. `requestSet` must be a properly formatted XML document. Returns `Promise`.

### registerSessionListener(sessionId)
Constructs a `RequestSet` document containing a `AddSessionListener` node for `sessionId`, and sends it to the 
SessionService. Returns `Promise`.

### isNotEnforced(req)
Checks if `req.originalUrl` is on the not enforced URL list.

### notifications
Express middleware that has a single route: `/agent/notifications`. It emits `session` events every time a session
notifications is received.


## Available config options for PolicyAgent

### serverUrl
The deployment URI of the OpenAM server, e.g. `http://openam.example.com:8080/openam`,

### appUrl
The root URL of the application, e.g. `http://app.example.com:8080`.

### notificationsEnabled
If enabled, the agent will cache sessions and register a change listener for them in OpenAM. 
Cached sessions will not be revalidated against OpenAM.

It requires the notifications middleware to be added to the express application (adds an `/agent/notifications` endpoint 
which can receive notifications from OpenAM). 

### notificationRoute
The route to which the `notifications` middleware is attached.

```javascript
app.use('/foo/bar/baz', agent.notifications);
app.listen(8080);
```

In the above case the `notificationRoute` should be `/foo/bar/baz`. Notifications will be 
sent to `http://app.example.com:8080/foo/bar/baz/agent/notifications`.

### username
The agent's username in OpenAM

### password
The agent's password in OpenAM

### realm
Name of the realm in OpenAM in which the agent profile exists. Default: `/`

### applicationName
The name of the OpenAM entitlement application to be used with this agent (e.g. `iPlanetAMWebAgentService`)

### ssoOnlyMode
If `true`, policies will not be evaluated.

### notEnforced
An array of not enforced URIs (relative to the root path), e.g. `['/foo/bar', '/baz']`
    

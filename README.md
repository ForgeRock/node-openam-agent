node-openam-agent [![Build Status](https://travis-ci.org/zoltantarcsay/node-openam-agent.svg?branch=master)](https://travis-ci.org/zoltantarcsay/node-openam-agent) [![npm version](https://badge.fury.io/js/openam-agent.svg)](http://badge.fury.io/js/openam-agent)
=================
OpenAM Policy Agent for expressjs

Table of Contents
-----------------

- [Install with npm](#install-with-npm)
- [How to use in your Express app](#how-to-use-in-your-express-app)
    - [Shields](#shields)
    - [Notifications](#notifications)
- [API](#api)
    - [Shield class](#shield-class)
    - [CookieShield class](#cookieshield-class)
    - [PolicyShield class](#policyshield-class)
    - [OAuth2Shield class](#oauth2shield-class)
    - [BasicAuthShield class](#basicauthshield-class)
    - [NotificationHandler class](#notificationhandler-class)
    - [OpenAMClient class](#openamclient-class)
    - [PolicyAgent class](#policyagent-class)
- [Compatibility](#compatibility)

Install with npm
----------------

```
npm install openam-agent
```
 
How to use in your Express app
------------------------------

* Create an agent profile in OpenAM (a 2.2 agent profile is enough since we only need a username and password, no server side config).

* Set up the express app and the agent:

```javascript
var express = require('express'),
    openam = require('openam-agent');

var app = express(),
    agent = new openam.PolicyAgent({
        serverUrl: 'http://openam.example.com:8080/openam',
        appUrl: 'http://app.example.com:8080',
        notificationRoute: '/',
        notificationsEnabled: true,
        username: 'my-agent',
        password: 'changeit',
        realm: '/'
    });
```

The agent can use implementations of the `Shield` class to protect resources. A shield can execute any code and then 
call success() or fail(). The abstract Shield class can be extended to introduce new agent features.

#### Shields 
Built in Shield implementations:

* **CookieShield**: enforces a valid SSOToken in a cookie set by OpenAM
* **OAuth2Shield**: enforces a valid OAuth2 token (provided by OpenAM) 
* **BasicAuthShield**: enforces a valid basic auth header (validates credentials against OpenAM) 
* **PolicyShield**: enforces OpenAM policies for a certain entitlement application

```javascript
var cookieShield = new openam.CookieShield();
app.use('/some/protected/route', agent.shield(cookieShield), function (req, res, next) {
    // your route handler code here
});

var oauth2Shield = new openam.OAuth2Shield();
app.use('/api/for/mobile/devices', agent.shield(oauth2Shield), function (req, res, next) {
    // your route handler code here
});

var basicAuthShield = new openam.BasicAuthShield();
app.use('/api/for/challenged/clients', agent.shield(basicAuthShield), function (req, res, next) {
    // your route handler code here
});

var policyShield = new openam.PolicyShield('my-app');
app.use('/very/secure', agent.shield(policyShield), function (req, res, next) {
    // your route handler code here
});
```
    
#### Notifications

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

If notifications are enabled, sessions will be cached by CookieShield. Otherwise, sessions will be validated upon every
request.

API
---

### Shield class

Abstract class. Implement your own Shield and plug it into the agent. It's really simple:

```javascript
// shield implementation 

var util = require('util'),
    openamAgent = require('openam-agent');
    
function MyShield(options) {
    this.options = options;
}

util.inherits(MyShield, Shield);

MyShield.prototype.evaluate = function (req, success, fail) {
    var sessionKey, sessionData;
    if (this.options.foo) {
        // do something
        sessionKey = 'foo';
        sessionData = 'bar';
        success(sessionKey, sessionData);
    } else {
        // failure
        fail(401, 'Unauthorized', 'Missing Foo...');
    }
};

// including it in the express app 

app.use(agent.shield(new MyShield({foo: 'bar'})));
```

### CookieShield class

This shield checks if the request contains a session cookie and validates it against OpenAM. The session is cached if 
notifications are enabled, otherwise it's re-validated for every request.

#### CookieShield(params)
The constructor function can be called with a `params` object or a string (whose value will be used to override the
default cookie name). Available options:

* **cookieName**: overrides the cookie name that was retrieved from OpenAM with `PolicyAgent.getServerInfo()`
* **noRedirect**: if `true`, the agent will not redirect to OpenAM's login page for authentication, only return a 401
 response
 
### PolicyShield class

This shield fetches policy decisions from OpenAM for the requested path, specified application name and current user.
It requires a valid session cookie. Typically used in a chain with CookieShield:

```javascript
var cookieShield = new openam.CookieShield();
var policyShield = new openam.PolicyShield('my-app');

app.use('/some/protected/route', agent.shield(cookieShield), agent.shield(policyShield), function (req, res, next) {
    // your route handler code here
});

```

#### PolicyShield(applicationName)
The constructor function can be called with an `applicationName` argument whose value will be used as the application 
name when fetching policy decisions. Default: `iPlanetAMWebAgentService`;


### OAuth2Shield class

This Shield implementation validates an OAuth2 access_token issued by OpenAM, using OpenAM's `/oauth2/tokeninfo` 
service. The access_token must be sent in an Authorization header:

```
curl -H 'Authorization Bearer 2dcaac7a-8ce1-4e62-8b3a-0d0b9949cc98' http://app.example.com:8080/mobile
```

#### OAUth2Shield(realm)
`realm` is the OpenAM realm in which the token should validated (default: `/`).


### BasicAuthShield class
This shield will enforce basic auth. Credentials will be checked against OpenAM.

#### BasicAuthShield(params)
Available params:

* **realm**: name of the realm in OpenAM to which the suer should be authenticated (default: `/`)
* **service**: chain/service name used for authentication
* **module**: module name used for authentication (overrides `service`)


### NotificationHandler class
Returns an object that can be used to manage notifications. Used internally by `PolicyAgent`. 

#### router
An instance of `express.Router`. It can be used as a middleware for your express application. It adds a single route:
`/agent/notifications` which can be used to receive notifications from OpenAM. When a notification is received, its
contents will be parsed and handled by one of the handler functions.
 
#### sessionNotification()
Notification handler for session notifications. When a session notification is received, it will emit a `session` event.
CookieShield instances listen on this event to delete any destroyed cookies from the agent's session cache. 

```javascript
app.use(agent.notifications.router);
agent.notifications.on('session', function (session) {
    console.log('server - session changed: %s', JSON.stringify(session));
});
```

(more notification handlers are coming soon...)

### OpenAMClient class

#### getServerInfo()
Gets the results of `/json/serverinfo/*` and mixes them in to `PolicyAgent.serverInfo`

#### authenticate(username, password, realm, service, module, noSession)
Sends an authentication request to OpenAM. Returns `Promise`. The `module` argument overrides `service`. The default 
realm is `/`. If noSession is `true`, the credentials will be validated but no session will be created. 

#### logout(sessionId)
Sends a logout request to OpenAM to to destroy the session identified by `sessionId`. Returns `Promise`.

#### validateSession(sessionId)
Validates a given sessionId against OpenAM. Returns `Promise`.

#### getLoginUrl(req)
Returns an OpenAM login URL with the `goto` query parameter set to the original URL in `req` (`req` must be an instance 
of `IncomingRequest`). Returns `String`.

#### getPolicyDecision(params, sessionId, cookieName)
Gets policy decisions from OpenAM for `params`. `params` must be a well formatted OpenAM policy request object:

```javascript
params = {
    resources: [
        '/foo',
        '/bar'
    ],
    application: 'my-app',
    subject: {
        ssoToken: '...'
    },
    environment: {}
}
```
It needs a valid `sessionId` and `cookieName` in order to make the request. (The user to whom the session belongs needs
to have the `REST calls for policy evaluation` privilege in OpenAM. Returns `Promise`.

#### sessionServiceRequest(requestSet)
Sends `requestSet` to the SessionService. `requestSet` must be a properly formatted XML document. Returns `Promise`.

#### validateAccessToken(accessToken, realm)
Validates the OAuth2 access_token in the specified realm. Returns `Promise`.

### PolicyAgent class

#### PolicyAgent(config)
The constructor function, whose argument should be an object of config options (listed below).

```javascript
var config = {
    serverUrl: 'http://openam.example.com:8080/openam',
    appUrl: 'http://app.example.com:8080',
    notificationRoute: '/',
    notificationsEnabled: true,
    username: 'my-agent',
    password: 'changeit',
    realm: '/'
};

var agent = new PolicyAgent(config);
```

#### Config options
* **serverUrl**: The deployment URI of the OpenAM server, e.g. `http://openam.example.com:8080/openam`,

* **appUrl**: The root URL of the application, e.g. `http://app.example.com:8080`.

* **notificationsEnabled**: If enabled, the agent will cache sessions and register a change listener for them in OpenAM. 
Cached sessions will not be revalidated against OpenAM.
The notifications middleware has be added to the express application for notifications to work (adds an `/agent/notifications` endpoint 
which can receive notifications from OpenAM). 

* **notificationRoute**: The route to which the `notifications` middleware is attached.

    ```javascript
    app.use('/foo/bar/baz', agent.notifications);
    app.listen(8080);
    ```

    In the above case the `notificationRoute` should be `/foo/bar/baz`. Notifications will be 
    sent to `http://app.example.com:8080/foo/bar/baz/agent/notifications`.

* **username**: The agent's username in OpenAM

* **password**: The agent's password in OpenAM

* **realm**: Name of the realm in OpenAM in which the agent profile exists. Default: `/`

* **errorPage**: Callback function; If present, the function's return value will be sent as an error page, otherwise the default error
template will be used.

    ```javascript
    config = {
        ...
        errorPage: function (status, message, details) {
            return '<html><body><h1>' + status + ' - '  + message + '</h1></body></html>'
        }
        ...
    }
    ```
 
#### config
The config object passed to the constructor.
 
#### serverInfo
A Promise returned by `getServerInfo()`. Once resolved, the response is mixed into the `serverInfo` object.

#### agentSession
A Promise returned by `authenticateAgent()`. Once resolved, the response is mixed into the `serverInfo` object.

#### openAMClient
An instance of `OpenAMClient`.

#### notifications
An instance of `NotificationHandler` that also serves as an `EventEmitter`. Events are emitted when notifications are
received.

##### notifications.routes
Express middleware that has a single route: `/agent/notifications`.

##### Events
* **session**: a session service notification is received. Callbacks will be called with a `session` argument.

#### authenticateAgent()
Authenticates the policy agent using the credentials in the config object. Returns `Promise`.

#### validateSession(sessionId)
Validates a given sessionId against OpenAM and adds a session listener if valid. Returns `Promise`.

#### getPolicyDecision(params)
Gets policy decisions from OpenAM for the `req.originalUrl` resource and the application name specified in the agent 
config (`req` must be an instance of `IncomingRequest`). Returns `Promise`.

#### registerSessionListener(sessionId)
Constructs a `RequestSet` document containing a `AddSessionListener` node for `sessionId`, and sends it to the 
SessionService. Returns `Promise`.


Compatibility
-------------

* [OpenAM 12.0.0](https://backstage.forgerock.com/#!/docs/openam/12.0.0) or newer

# ChatUp

ChatUp is a highly performant and scalable webchat plateform.

It uses [NodeJS](https://nodejs.org/), [Redis](http://redis.io/) and [Nginx](http://nginx.org/) with the [PushStream Module](https://github.com/wandenberg/nginx-push-stream-module).

ChatUp is:

- used to host public webchat rooms and allow a large number of users to interact in these rooms
- scalable to multiple servers and, by default, scaled to the number of cores available on the server
- secured with JSON Web Token Authentication to integrate in an existing system
- fully customizable client-side by using the corresponding lib
- fault-tolerant
- separated in multiple micro-services
- used at large scale and created by [Streamup](https://streamup.com/)

## Test it with Docker

ChatUp is available on Docker. You can use this image to test it quickly or to deploy it easily in production.

To do so, execute those three commands:

```
docker run --name chatup-redis -d redis
docker run --link chatup-redis:redis -e CHATUP_REDISHOST=redis --name chatup-dispatcher -d geekuillaume/chatup dispatcher
docker run --link chatup-redis:redis -e CHATUP_REDISHOST=redis --name chatup-worker -d geekuillaume/chatup worker --use-container-ip
```

You can then get the dispatcher IP with `docker inspect --format '{{ .NetworkSettings.IPAddress }}' chatup-dispatcher` and use the example [client page](https://rawgit.com/geekuillaume/ChatUp/master/examples/client/index.html) indicating this IP to test it.

You can spawn multiple workers and load-balance without having to configure anything else. If you want to add multiple dispatchers, you need to put a load-balancer in front of them.

For the JWT, you can use the awesome [jwt.io](http://jwt.io/) website with the `RS256` algorithm and the [public](examples/JWTKeyExample.pub) and [private](examples/JWTPrivateExample.key) example keys.

Here is a basic JWT and it's decrypted payload:

```
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiVGVzdCAxIiwiX3B1YmxpYyI6eyJuYW1lIjoiVGVzdCAxIn19.1uNu_T7xKtozXgqwoY31ouDo13H-RJ_q-yfqWau2Im-3PXxEcnn_hFuSJii_XJQKpVz1bVJG4vV9o67Wi0vI1B9A2WGHA2Wud9zWHj0UiL-jWhPd_EypMlVhr6AVe6YeP_IeguUAqD6u9tjOQhPrmIQ9zw327Pm9CHpGD_JZAgeHmVNaz67f-4nrRNZkGWrVrPXe2TKaiSz9gAIfMdae0ySY14QMStWHR-80YLwq2lpRmAWamxf6BCZ8f6HMv6k-0QcFb-n8j0wtOrKVxICQvSBhdyHQCTrGqKuRsLBd3eLBAMPlhmWKDyNYsCnvA9A73bYNPMN3w_FOy3jzv6LpBA
```

```json
{
  "name": "Test 1",
  "_public": {
    "name": "Test 1"
  }
}
```

## How to Install

On Ubuntu (tested on 14.04):
```bash
curl 'https://rawgit.com/geekuillaume/ChatUp/master/examples/install.sh' | bash
```

You can look at the [install.sh](examples/install.sh) script but basically, it installs Git, NodeJS, Nginx, clone this repo and install its NodeJS dependancies.

For other plateforms, you can port the [install.sh](examples/install.sh) script very easily.

## How to use

There is three type of installations, each of them can be used simultaneously on the same machine of scaled to N machines.

For fault-tolerancy, you need to have at least 2 of each.

### Dispatcher

The dispatcher handles the initial request of the client and redirects him to the best ChatWorker. It's also used for statistics.

To start a dispatcher, simply start the [corresponding example script](examples/dispatcher/index.js) with:

```bash
node examples/dispatcher/index.js
```

You then need to load-balance the clients requests to all the dispatchers and point the client to the correct URL.

### Chat Worker

The Chat Worker is responsible for all the messages in the chat rooms. It's composed of two elements, the NodeJS service that receives the messages from the clients and Redis, and Nginx (with PushStream) that broadcast these messages to the connected clients.

You need to have these two elements running on the same machine.

To start the ChatWorker Nginx service:
```bash
node examples/chatWorker/index.js
```

To start Nginx:
```bash
sudo /usr/local/nginx/sbin/nginx -c $PWD/examples/chatWorker/nginx.conf
```
(You need to indicate the absolute path of the nginx [configuration file](examples/chatWorker/nginx.conf))

### Redis

Redis is used for messaging between all the other components. You simply have to [install it](http://redis.io/download#installation) and point the dispatchers and ChatWorkers to it.

### Client lib

The [client lib](client/lib.js) is separated in two classes: `ChatUpProtocol` and `ChatUp`. The first handles all the messages and fault-tolerancy and the second is an integration with HTML and CSS.

The client lib is packaged with all its dependancies thanks to Browserify and exposes these two classes to the `window.ChatUp` object (so use `window.ChatUp.ChatUpProtocol` or `window.ChatUp.ChatUp`).

You can also see the [example page](examples/client/index.html) to test your installation.

You can modify use the ChatUp class as a starting point for your implementation.

## FAQ

### How to use SSL

SSL is supported in ChatUp but you need to attach a valid domain to your ChatWorkers as certificates cannot be attached to an IP.

To activate SSL, see the corresponding examples files.

### How to transmit user information

User information are stored inside the JSON Web Token. This token must be signed by you authentication server and passed to the client.

Inside this token, you must include a `_public` object that will be broadcast to all the rooms clients on each message. It will also be available in the dispatcher stats.

### How to ban users

You can ban a user on a channel by making a POST request to one of the dispatcher on the endpoint `/ban`.

The body of this POST request needs to be a JSON Web Token containing an array of the users to ban, channel on which to ban them and an optionnal ban expire (in seconds). Here an example of a JSON web token content:

```json
[{
  "name": "test1",
  "channel": "TestRoom",
  "expire": 30
}, {
  "name": "test2",
  "channel": "TestRoom2"
}]
```

Using the example Public/Private key pair with this example makes the following JWT:

```
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.W3sibmFtZSI6InRlc3QxIiwiY2hhbm5lbCI6IlRlc3RSb29tIiwiZXhwaXJlIjozMH0seyJuYW1lIjoidGVzdDIiLCJjaGFubmVsIjoiVGVzdFJvb20yIn1d.nQ3S48j7J4x3NgNAhi2Qz36MebQMOxc5rHrMcm0D3bERRei2kyTVYmvcLLLJSeSyCX2KzQiV9iMnYgk4JKSEfR52tw4UUXa-7jbgmhhcDpIwo4hiIWgsZokKdo3uRX_UX8jI4ii64Tc8aq-kZiEut4WfxGjuVLlHqj-u77ileKugzhDn7bh-m0PhvdJyZGmCMCcXLnKF-TX2w-XJ_5ZvET5Ki2FH_55-W-WCrX8kPA9pSg5WLrdCunqh6p4zNFMXBxRqV3q1u3TSq4DJQkQRACAKZRqhoJz3KsYNzlxfAfhkt0OsJCwoUAOlcg95xmmSJoxwFJTCojo2lK5YTLD3yg
```

The `name` is matched against the `name` field of the `_public` sent in the client JSON web token.

### How to get messages history of a room

You can configure the Chat Worker to keep in cache (on Redis) the last N messages (look at the example file for the Chat Worker). These messages are available on an API endpoint from the Dispatcher. You can access these messages by requesting the `/messages/:channelName` route.

Remarque: These messages are only available from the API endpoints, it's different from the messages in cache served when a new user connects. Thoses messages are stored directly in Nginx and are automatically fetched on connection start by the Client Lib.

### How to use additional channels

You can configure a client to listen on additional channels to be able to send him specific notifications. To do that, just add the `additionalChannels` property in the client configuration (look at the example for a concrete use).

These channels can be used to send a message to a specific user or to broadcast a message to all your users.

### How to post a message from the API endpoint

You can use the `POST /post` API endpoint to send multiple messages to specific channels. This request body must be a JWT containing something like this:

```json
[{
  "channel": "notifications",
  "msg": "This is a test",
  "user": {
    "name": "Server"
  }
}, {
  "channel": "notifications2",
  "msg": "This is a second test",
  "user": {
    "name": "Server 2"
  }
}]
```

The message will be broadcasted to all Chat Workers and then to all clients that are subscribed to the channel.

## License

ChatUp is licensed on GNU GENERAL PUBLIC LICENSE.

See the [LICENSE](LICENSE) file for more information.

## History

ChatUp has been developed for Streamup by me, Guillaume Besson. After some talks, we decided to publish it freely for other to use.

It's now used on [Streamup](https://streamup.com) under high load.

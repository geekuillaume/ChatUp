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

Inside this token, you must include a `public` object that will be broadcast to all the rooms clients on each message. It will also be available in the dispatcher stats.

## License

ChatUp is licensed on GNU GENERAL PUBLIC LICENSE.

See the [LICENSE](LICENSE) file for more information.

## History

ChatUp has been developed for Streamup by me, Guillaume Besson. After some talks, we decided to publish it freely for other to use.

It's now used on [Streamup](https://streamup.com) under high load.

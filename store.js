var redis = require('redis');
var _ = require('lodash');

module.exports.run = function (store) {
  console.log('   >> Store PID:', process.pid);

  var options = store.options;
  var instanceId = store.instanceId;

  var subClient = redis.createClient(options.port, options.host, options);
  var pubClient = redis.createClient(options.port, options.host, options);

  store.on('subscribe', subClient.subscribe.bind(subClient));
  store.on('unsubscribe', subClient.unsubscribe.bind(subClient));
  store.on('publish', function (channel, data) {
    if (data instanceof Object) {
      data = 'o:' + JSON.stringify(data);
    } else {
      data = 's:' + data;
    }

    if (instanceId !== null) {
      data = instanceId + '/' + data;
    }

    pubClient.publish(channel, data);
  });

  subClient.on('message', function (channel, message) {
    var sender = null;
    var messageSplit = message.split('/');
    if (messageSplit.length >= 2) {
      sender = messageSplit[0];
      message = messageSplit.slice(1).join("/");
    } else {
      message = messageSplit[0];
    }

    // Do not publish if this message was published by
    // the current SC instance since it has already been
    // handled internally
    if (sender === null || sender !== instanceId) {
      var type = message.charAt(0);
      var data;
      if (type == 'o') {
        try {
          data = JSON.parse(message.slice(2));
        } catch (e) {
          data = message.slice(2);
        }
      } else {
        data = message.slice(2);
      }
      store.publish(channel, data);
    }
  });
};

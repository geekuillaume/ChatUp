var _ = require('lodash');

module.exports.run = function (worker) {
  console.log('   >> Worker PID:', process.pid);
  var scServer = worker.getSCServer();

  scServer.addMiddleware(scServer.MIDDLEWARE_HANDSHAKE, function(req, next) {
    next();
  });

  scServer.addMiddleware(scServer.MIDDLEWARE_SUBSCRIBE, function(socket, channel, next) {
    if (!_.startsWith(channel, 'room_')) {
      return next(channel + ' is not a valid room name');
    }
    var authToken = socket.getAuthToken();
    if (!authToken) {
      return next('You need to be logged in to subscribe to a channel');
    }
    next();
  });

  scServer.addMiddleware(scServer.MIDDLEWARE_PUBLISH_IN, function(socket, channel, data, next) {
    if (!_.isObject(data) || !_.isString(data.message)) {
      return next('Wrong message type');
    }
    var authToken = socket.getAuthToken();
    if (!authToken || !socket.isSubscribed(channel)) {
      return next('You can only post to a room you are subscribed to');
    }
    data.origin = authToken.user;
    data.originId = socket.id;
    next();
  });

  scServer.addMiddleware(scServer.MIDDLEWARE_PUBLISH_OUT, function(socket, channel, data, next) {
    if (data.originId === socket.id) {
      return;
    }
    next();
  });

  scServer.on('connection', function (socket) {
    socket.on('login', function(userData, next) {
      var authToken = {
        user: userData
      };
      socket.setAuthToken(authToken);
      next(null, {authenticated: true});
    });
  });
};

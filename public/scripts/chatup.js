// benchmark({
//   messageLength: 120,
//   interval: 1000,
//   logInterval: 5000,
//   connexions: 50,
//   channelsNumber: 1
// });

function benchmark(options) {
  var channels = _.map(Array(options.channelsNumber), function(x, i) {return 'room_' + i;});
  var sockets = [];
  async.map(
    _.map(Array(options.connexions), function(){return _.sample(channels);}),
    createSocket,
    function(err, results) {
      _.each(results, function(socketInfos) {
        setInterval(function sendMessageToSocket() {
          socketInfos.channel.publish({message: randomId(options.messageLength)});
        }, options.interval);
      });

      setInterval(function() {
        console.log('Received %s messages', _(results).map('messageCount').sum());
      }, options.logInterval);
    }
  );
}

createSocket({port: 8000}, function(err, infos) {
  window.server1 = infos;
});
// createSocket({port: 8001}, function(err, infos) {
//   window.server2 = infos;
// });

function createSocket(infos, callback) {
  var socket = socketCluster.connect({
    hostname: infos.hostname || 'localhost',
    secure: false,
    port: infos.port || 8001,
    // autoReconnectOptions: {
    //   initialDelay: 1000,
    //   randomness: 0
    // }
  });

  socket.on('status', function(status) {
    if (status.isAuthenticated) {
      launchChat();
    } else {
      authenticate(socket, randomId(10), launchChat);
    }
  });

  socket.messageCount = 0;

  function launchChat() {
    var channel = socket.subscribe(infos.channelName || 'room_0');
    var socketInfos = {
      socket: socket,
      channel: channel,
      messageCount: 0
    };
    channel.watch(function addMessageCount(msg) {
      socketInfos.messageCount++;
      console.log('received:', msg);
    });
    channel.on('subscribe', function() {
      callback(null, socketInfos);
    });
  }
}

function authenticate(socket, username, cb) {
  socket.emit('login', {
    username: username
  }, cb);
}

function randomId(length) {
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for(var i = 0; i < length; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}

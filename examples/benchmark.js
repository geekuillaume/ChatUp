var _ = require('lodash');
var now = require('performance-now');
var argv = require('minimist')(process.argv.slice(2));
var cluster = require('cluster');
var debug = require('debug')('ChatUp:benchmark');

var ChatUp = require('../client/chatup');

var benchmarkOptions = {
  messageLength: argv.messageLength || 120,
  interval: argv.interval || 1000,
  logInterval: argv.logInterval || 2000,
  connexions: (argv.connexions || 1) / (argv.t || 1),
  roomsNumber: argv.rooms || 1,
  threads: (argv.t || 1),
  startDelay: 5000,
  startDelayInterval: 500,
  dispatcherURL: argv.dispatcher || 'http://127.0.0.1:8000/'
};


if (cluster.isMaster) {
  var workersStats = [];
  var workers = [];
  for (var i = 0; i < benchmarkOptions.threads; i++) {
    (function(i) {
      var worker = cluster.fork();
      workers.push(worker);
      worker.on('message', function(workerStats) {
        workersStats[i] = workerStats;
      });
    })(i);
  }

  setInterval(function() {
    var stats = _(workersStats).reduce(_.partialRight(_.merge, _.add), {});
    console.log('Sent: %s, Received: %s, latency: %sms', stats.msgSent, stats.msgReceived, (stats.latency / workers.length).toFixed(3));
  }, benchmarkOptions.logInterval / 2);

} else {
  benchmark(benchmarkOptions);
}

function benchmark(options) {
  var rooms = _.map(_.range(options.roomsNumber), function(x, i) {return 'room' + i;});
  var promises = [];
  function createChats(n) {
    debug('Initializing %s Chats', n);
    for (var i = 0; i < n; i++) {
      if (promises.length >= options.connexions)
        return;
      promises.push(new ChatUp.ChatUpProtocol({
        dispatcherURL: options.dispatcherURL,
        userInfo: {name: randomId(20)},
        room: _.sample(rooms),
        socketIO: {transports: ['websocket'], multiplex: false} // Disable multiplex to create a socket per connection
      }).init());
    }
  }
  setTimeout(function createChatsLoop() {
    if (promises.length < options.connexions) {
      createChats(_.max([options.connexions / (options.startDelay / options.startDelayInterval), 1]));
      setTimeout(createChatsLoop, options.startDelayInterval);
    } else {
      waitForChats();
    }
  }, options.startDelayInterval);

  function waitForChats() {
    Promise.all(promises).then(function(sockets) {
      console.log('%s workers started and connected', sockets.length);
      _.each(sockets, function(socket, i) {
        socket.onMsg(_.noop);
        setTimeout(function() {
          debug('Starting message loop on socket %s', i);
          var sendMessage = function() {
            socket.say(randomId(options.messageLength));
          };
          sendMessage();
          setInterval(sendMessage, options.interval);
        }, i * (options.interval / options.connexions));
      });

      setInterval(function() {

        var stats = _(sockets).map('stats').reduce(_.partialRight(_.merge, _.add), {});
        stats.latency /= sockets.length;
        process.send(stats);

      }, options.logInterval / 2);

    }).catch(function(err) {
      console.error("Couldn't create chats client:", err.stack);
    });
  }
}

function randomId(length) {
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for(var i = 0; i < length; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}

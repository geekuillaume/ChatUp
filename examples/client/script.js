var argv = {};

var benchmarkOptions = {
  messageLength: argv.messageLength || 120,
  interval: argv.interval || 100,
  logInterval: argv.logInterval || 2000,
  connexions: (argv.connexions || 10) / (argv.t || 1),
  roomsNumber: argv.rooms || 1,
  threads: (argv.t || 1),
  dispatcherURL: 'http://localhost:8000/'
};

benchmark(benchmarkOptions);

function benchmark(options) {
  var rooms = _.map(_.range(options.roomsNumber), function(x, i) {return 'room' + i;});
  Promise.all(_.map(_.range(options.connexions), function() {
    return new ChatUp({
      dispatcherURL: options.dispatcherURL,
      userInfo: {name: randomId(20)},
      room: _.sample(rooms),
      socketIO: {transports: ['websocket'], multiplex: false}
    }).init();
  })).then(function(sockets) {
    console.log('%s workers started and connected', sockets.length);
    _.each(sockets, function(socket, i) {
      socket.onMsg(_.noop);
      setTimeout(function() {
        var sendMessage = function() {
          socket.say(randomId(options.messageLength));
        };
        sendMessage();
        setInterval(sendMessage, options.interval);
      }, i * (options.interval / options.connexions));
    });

    setInterval(function() {

      var stats = _(sockets).map('stats').reduce(_.merge);
      console.log('Sent: %s, Received: %s', stats.msgSent, stats.msgReceived);

    }, options.logInterval);

  }).catch(function(err) {
    console.error(err);
  });
}

function randomId(length) {
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for(var i = 0; i < length; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}

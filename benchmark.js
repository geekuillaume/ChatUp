var socketCluster = require('socketcluster-client');
var _ = require('lodash');
var async = require('async');
var now = require('performance-now');
var argv = require('minimist')(process.argv.slice(2));
var cluster = require('cluster');

GLOBAL.document = {};

var benchmarkOptions = {
  messageLength: argv.messageLength || 120,
  interval: argv.interval || 1000,
  logInterval: argv.logInterval || 5000,
  connexions: (argv.connexions || 50) / (argv.t || 1),
  channelsNumber: argv.channels || 50,
  threads: (argv.t || 1),
  hosts: [
    {
      hostname: "104.237.135.199",
      port: "8001"
    },
    {
      hostname: "45.33.7.81",
      port: "8001"
    }
  ]
};

if (cluster.isMaster) {
  for (var i = 0; i < benchmarkOptions.threads; i++) {
    cluster.fork();
  }

  var stats = {};

  _.each(cluster.workers, function(worker) {
    worker.on('message', function(message) {
      stats[worker.id] = message;
    });
  });

  setInterval(function() {
    var log = 'Received ' + _(stats).map('messageReceived').sum() + ', sended ' + _(stats).map('messageSent').sum() + ' hosts: ' + _.map(benchmarkOptions.hosts, function(host, i) {
      return (_.chain(stats).map('latencies').map(function(el) {return el[i];}).sum().value() / benchmarkOptions.threads).toFixed(3) + 'ms ';
    }).join('');
    console.log(log);
  }, benchmarkOptions.logInterval);

  cluster.on('exit', function(worker, code, signal) {
    console.log('worker ' + worker.process.pid + ' died');
  });
} else {
  benchmark(benchmarkOptions);
}



function benchmark(options) {
  var channels = _.map(Array(options.channelsNumber), function(x, i) {return 'room_' + i;});
  _.each(options.hosts, function(host) {host.lastTimes = [];});
  var sockets = [];
  async.map(
    _.map(Array(options.connexions), function(){
      var host = _.sample(options.hosts);
      return {
        channelName: _.sample(channels),
        host: host,
        options: options
      };
    }),
    createSocket,
    function(err, results) {
      console.log('%s workers started and connected', results.length);
      console.log('Starting sending messages at rate %s messages per %s seconds', results.length, options.interval / 1000);
      _.each(results, function(socketInfos, i) {
        setTimeout(function() {
          socketInfos.publishMessage();
          setInterval(socketInfos.publishMessage, options.interval);
        }, i * (options.interval / options.connexions));
      });

      setInterval(function() {

        process.send({
          messageSent: _(results).map('messageSended').sum(),
          messageReceived: _(results).map('messageReceived').sum(),
          latencies: _.map(options.hosts, function(host) {
            var latency = _.sum(host.lastTimes) / host.lastTimes.length;
            host.lastTimes = [];
            return latency;
          })
        });

      }, options.logInterval / 2);
    }
  );
}

function createSocket(infos, callback) {
  var socket = socketCluster.connect({
    hostname: infos.host.hostname || 'localhost',
    secure: false,
    port: infos.host.port || 8001,
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

  var socketInfos = {
    socket: socket,
    messageSended: 0,
    messageReceived: 0
  };

  socketInfos.publishMessage = function() {
    var start = now();
    socketInfos.channel.publish({message: randomId(infos.options.messageLength)}, function(err) {
      if (err) {
        return console.error('Cannot publish:', err);
      }
      socketInfos.messageSended++;
      infos.host.lastTimes.push(now() - start);
    });
  };

  function launchChat() {
    var channel = socket.subscribe(infos.channelName || 'room_0');
    socketInfos.channel = channel;
    channel.watch(function addMessageCount(msg) {
      socketInfos.messageReceived++;
    });
    channel.on('subscribe', function() {
      callback(null, socketInfos);
    });
    channel.on('error', function(err) {
      console.log('Got error:', err);
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

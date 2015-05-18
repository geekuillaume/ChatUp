var argv = require('minimist')(process.argv.slice(2));
var SocketCluster = require('socketcluster').SocketCluster;

var socketCluster = new SocketCluster({
  workers: Number(argv.w) || 4,
  stores: Number(argv.s) || 1,
  port: Number(argv.p) || 8001,
  appName: argv.n || 'chatup',
  workerController: __dirname + '/worker.js',
  storeController: __dirname + '/store.js',
  socketChannelLimit: 100,
  rebootWorkerOnCrash: false,
  logLevel: 3,
  secretKey: "jlshflquynlorqiupoaziwpodfboquypourmwoquybrncqmoeipçuf",
  origins: '*:*',
  storeOptions: {
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 6379
  }
});

process.on('SIGUSR2', function() {
  process.kill(process.pid, 'SIGKILL');
});

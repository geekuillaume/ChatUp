#!/bin/sh
':' //; exec "$(command -v nodejs || command -v node)" "$0" "$@"

var forever = require('forever');

if (process.argv[2] === "dispatcher") {
  forever.start('examples/dispatcher/index.js', {
    max: 1
  });
} else if (process.argv[2] === "worker") {
  var nginxDaemon = forever.start("-c/home/chatup/examples/chatWorker/nginx.conf", {
    command: "/usr/local/nginx/sbin/nginx",
    max: 1,
    silent: false,
    logFile: 'nginx.log'
  });
  nginxDaemon.on('exit', function() {
    forever.stopAll();
    process.exit(1);
  });

  if (process.argv[3] === "--use-container-ip") {
    require('dns').lookup(require('os').hostname(), function (err, addr, fam) {
      forever.start('examples/chatWorker/index.js', {
        silent: false,
        max: 1,
        env: {
          CHATUP_HOSTNAME: addr
        }
      });
    })
  } else {
    var workerDaemon = forever.start('examples/chatWorker/index.js', {
      silent: false,
      max: 1
    });
  }

  process.on('exit', function() {
    forever.stopAll();
  });

} else {
  console.error('First arg should be "dispatcher" or "worker"');
  console.error("Got:", process.argv);
  process.exit(1);
}

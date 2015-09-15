var ChatUp = require('../../index.js');
var fs = require('fs');

var dispatcher = new ChatUp.Dispatcher({
  ssl: {
    key: process.env.CHATUP_SSLKEY,
    cert: process.env.CHATUP_SSLCERT
  },
  // if not set, equals require('os').cpus().length
  threads: process.env.CHATUP_THREADS || require('os').cpus().length,
  jwt: {
    key: process.env.CHATUP_JWTKEY || require('fs').readFileSync(__dirname + '/../JWTKeyExample.pub').toString(),
    options: {
      algorithms: ["RS256"]
    }
  },
  sentry: {
    dsn: process.env.CHATUP_SENTRYDSN
  },
  redis: {
    host: process.env.CHATUP_REDISHOST || 'localhost',
    port: process.env.CHATUP_REDISPORT
  },
});

var port = process.env.CHATUP_PORT || 80;

dispatcher.listen(port, function() {
  console.log('Dispatcher listening on port %s', port);
});

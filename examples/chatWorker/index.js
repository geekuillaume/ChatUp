var ChatUp = require('../../');
var fs = require('fs');

var conf = {
  redis: {
    host: process.env.CHATUP_REDISHOST || 'localhost',
    port: process.env.CHATUP_REDISPORT
  },
  port: process.env.CHATUP_PORT || 42633,
  announcedPort : process.env.CHATUP_ANNOUCEDPORT || 80,
  hostname: process.env.CHATUP_HOSTNAME || "127.0.0.1",
  origins: process.env.CHATUP_ORIGINS || '*',
  threads: process.env.CHATUP_THREADS || require('os').cpus().length,
  sticky: process.env.CHATUP_STICKY || true, // For benchmark purpose, we don't want to have sticky sessions
  jwt: {
    key: process.env.CHATUP_JWTKEY || require('fs').readFileSync(__dirname + '/../JWTKeyExample.pub').toString(),
    options: {
      algorithms: ["RS256"]
    }
  },
  messageHistory: { // It's different from the history length sent on client connection (located in nginx conf file)
    size: process.env.CHATUP_MESSAGEHISTORYSIZE || 100, // The length of the message staying in history for dispatcher access
    expire: process.env.CHATUP_MESSAGEHISTORYEXPIRE || 24 * 60 * 60 // The time before the expiration of the history in seconds (if not modified before)
  },

  // You can also use SSL, just provide you cert and key
  ssl: {
    key: process.env.CHATUP_SSLKEY,
    cert: process.env.CHATUP_SSLCERT
  },
};

var worker = new ChatUp.ChatWorker(conf);

worker.listen().then(function() {
  console.log('Chat Worker started !');
}).catch(function(err) {
  console.error('Couldn\'t start:', err);
  process.exit();
});

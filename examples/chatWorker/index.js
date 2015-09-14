var ChatUp = require('../../');
var fs = require('fs');

var conf = {
  redis: {
    host: 'localhost',
    port: 6379
  },
  // port: 8001,
  hostname: "127.0.0.1",
  origins: '*',
  threads: 1,
  sticky: false, // For benchmark purpose, we don't want to have sticky sessions
  jwt: {
    key: require('fs').readFileSync(__dirname + '/../JWTKeyExample.pub').toString(),
    options: {
      algorithms: ["RS256"]
    }
  },
  messageHistory: { // It's different from the history length sent on client connection (located in nginx conf file)
    size: 10, // The length of the message staying in history for dispatcher access
    expire: 24 * 60 * 60 // The time before the expiration of the history in seconds (if not modified before)
  }

  // You can also use SSL, just provide you cert and key
  /*ssl: {
    key: fs.readFileSync('./test/server.key').toString(),
    cert: fs.readFileSync('./test/server.crt').toString()
  }*/
};

var worker = new ChatUp.ChatWorker(conf);

worker.listen().then(function() {
  console.log('Chat Worker started !');
}).catch(function(err) {
  console.error('Couldn\'t start:', err);
  process.exit();
});

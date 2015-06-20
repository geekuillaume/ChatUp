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
    key: require('fs').readFileSync(__dirname + '/JWTKeyExample.pub').toString(),
    options: {
      algorithms: ["RS256"]
    }
  },
  // You can also use SSL, just provide you cert and key
  /*ssl: {
    key: fs.readFileSync('./test/server.key'),
    cert: fs.readFileSync('./test/server.crt')
  }*/
};

var worker = new ChatUp.ChatWorker(conf);

worker.listen().then(function() {
  console.log('Chat Worker started !');
}).catch(function(err) {
  console.error('Couldn\'t start:', err);
  process.exit();
});

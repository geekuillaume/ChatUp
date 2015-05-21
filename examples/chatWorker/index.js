var ChatUp = require('../../');

var worker = new ChatUp.ChatWorker({
  redis: {
    host: 'localhost',
    port: 6379
  },
  port: 8001,
  origins: '*',
  threads: 6,
  sticky: false // For benchmark purpose, we don't want to have sticky sessions
});

worker.listen().then(function() {
  console.log('Chat Worker started !');
}).catch(function(err) {
  console.error('Couldn\'t start:', err);
  process.exit();
});

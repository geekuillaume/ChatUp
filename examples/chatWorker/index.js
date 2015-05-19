var ChatUp = require('../../');

var worker = new ChatUp.ChatWorker({
  redis: {
    host: 'localhost',
    port: 6379
  },
  port: 8001,
  origins: '*'
});

worker.listen().then(function() {
  console.log('Chat Worker started !');
}).catch(function(err) {
  console.error('Couldn\'t start:', err);
  process.exit();
});

var ChatUp = require('../../index.js');
var express = require('express');

var app = express();

var dispatcher = new ChatUp.Dispatcher({
  workers: [{
    host: '127.0.0.1',
    port: '8001'
  }]
});

dispatcher.register(app);

app.listen(8000, function() {
  console.log('Dispatcher listening on port 8000');
});

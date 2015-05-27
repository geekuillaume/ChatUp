var ChatUp = require('../../index.js');
var express = require('express');

var app = express();

var dispatcher = new ChatUp.Dispatcher();

dispatcher.register(app);

app.listen(8000, function() {
  console.log('Dispatcher listening on port 8000');
});

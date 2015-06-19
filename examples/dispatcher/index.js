var ChatUp = require('../../index.js');
var express = require('express');
var https = require('https');
var fs = require('fs');

// This line is from the Node.js HTTPS documentation.
var options = {
  key: fs.readFileSync('/var/certs/streamup-key.pem'),
  cert: fs.readFileSync('/var/certs/streamup-cert.cert')
};

var app = express();

var dispatcher = new ChatUp.Dispatcher();

dispatcher.register(app);

app.listen(8000, function() {
  console.log('Dispatcher listening on port 8000');
});

https.createServer(options, app).listen(443);

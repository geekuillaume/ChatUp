import express = require('express');
import Dispatcher = require('../index');

var dispatchHandler = function (parent: Dispatcher.Dispatcher) {

  var handler: express.RequestHandler = function(req, res) {

    parent._workersManager.getAvailable().then(function(worker) {
      res.send(worker);
    }).catch(function(err) {
      res.status(500).send(err);
    });

  };

  return handler;

};

export = dispatchHandler;

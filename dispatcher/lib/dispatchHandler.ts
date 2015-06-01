import express = require('express');
import Dispatcher = require('../index');

var dispatchHandler = function (parent: Dispatcher.Dispatcher) {

  var handler: express.RequestHandler = function(req, res) {

    parent._workersManager.getAvailable().then(function(worker) {
      if (worker) {
        res.send(worker);
      } else {
        // A dispatcher without workers is just like a teapot
        res.status(418).send({error: 'No workers available'});
      }
    }).catch(function(err) {
      console.log('Got:', err);
      res.status(500).send(err);
    });

  };

  return handler;

};

export = dispatchHandler;

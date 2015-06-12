import express = require('express');
import Dispatcher = require('../index');
import {getChannelStats} from './stats';

var dispatchHandler = function (parent: Dispatcher.Dispatcher) {

  var handler: express.RequestHandler = function(req, res) {

    var exclude;
    if (req.body && req.body.type && req.body.worker) {
      exclude = req.body.worker.id;
    }

    parent._workersManager.getAvailable({excludeId: exclude}).then(function(worker) {
      var channelStats = getChannelStats(parent, req.param('channelName'));
      if (worker) {
        res.send({
          host: worker.host,
          id: worker.id,
          channel: channelStats
        });
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

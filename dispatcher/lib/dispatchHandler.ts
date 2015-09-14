import express = require('express');
import Dispatcher = require('../index');
import {getChannelStats} from './stats';
import logger = require('../../common/logger');
var debug = require('debug')('ChatUp:Dispatcher');

var dispatchHandler = function (parent: Dispatcher.Dispatcher) {

  var handler: express.RequestHandler = function(req, res) {

    var exclude;
    if (req.body && req.body.type && req.body.worker) {
      exclude = req.body.worker.id;
    }

    debug('Getting an available worker')
    parent._workersManager.getAvailable({excludeId: exclude}).then(function(worker) {
      var channelStats = getChannelStats(parent, req.params.channelName);
      if (worker) {
        debug('Sending worker %s at %s', worker.id, worker.host);
        res.send({
          host: worker.host,
          id: worker.id,
          channel: channelStats
        });
      } else {
        logger.captureError(new Error('No worker available'));
        debug('No worker available')
        // A dispatcher without workers is just like a teapot
        res.status(418).send({error: 'No workers available'});
      }
    }).catch(function(err) {
      logger.captureError(err);
      debug('Error while getting worker', err);
      res.status(500).send(err);
    });

  };

  return handler;

};

export = dispatchHandler;

import express = require('express');
import _ = require('lodash');
import {Dispatcher} from '../index';

export function statsHandler(parent: Dispatcher) {
  var handler: express.RequestHandler = function(req, res) {

    var workers = parent._workersManager.getWorkers();

    var stats: any = getChannelStats(parent, req.params.channelName);
    stats.limit = req.query.limit || 50;
    stats.skip = req.query.skip || 0;
    stats.clients = getChannelClients(parent, req.params.channelName, {
      limit: stats.limit, skip: stats.skip
    });

    res.send(stats);

  };

  return handler;
}

export function getChannelStats(parent: Dispatcher, channelName: string) {
  var workers = parent._workersManager.getWorkers();
  return {
    subCount: _(workers).map(_.property('subStats.' + channelName)).sum() || 0,
    pubCount: _(workers).map(_.property('pubStats.' + channelName)).map('length').sum() || 0
  };
}

export function getChannelClients(parent: Dispatcher, channelName: string, options: {limit: number, skip: number} = {limit: 50, skip: 0}) {
  var workers = parent._workersManager.getWorkers();

  var clients = _(workers).map(_.property('pubStats.' + channelName)).flatten().compact().value();
  return _.slice(clients, options.skip, options.skip + options.limit);
}

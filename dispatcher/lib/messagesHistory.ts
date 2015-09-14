import express = require('express');
import _ = require('lodash');
import {Dispatcher} from '../index';
import logger = require('../../common/logger');

export function messagesHistoryHandler(parent: Dispatcher) {
  var handler: express.RequestHandler = function(req, res) {

    getChannelMessages(parent, req.params.channelName).then(function(messages) {
      res.send(messages);
    }).catch(function(err) {
      logger.captureError(logger.error('Cannot get messages history from Redis', {err}));
      res.sendStatus(500);
    })

  };

  return handler;
}

export function getChannelMessages(parent: Dispatcher, channelName: string): Promise<any> {
  return new Promise(function(resolve, reject) {
    parent._redisConnection.lrange('chatUp:room:r_' + channelName, 0, -1, function(err, messages) {
      if (err) {
        return reject(err);
      }
      resolve(_.map(messages, function(raw: string) {
        return JSON.parse(raw);
      }));
    });
  })
}

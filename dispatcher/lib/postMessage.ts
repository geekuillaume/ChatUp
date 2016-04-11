import express = require('express');
import _ = require('lodash');
import {Dispatcher} from '../index';
import logger = require('../../common/logger');
import jwt = require('jsonwebtoken');
var uuid = require('node-uuid');

export function postMessageHandler(parent: Dispatcher) {
  var handler: express.RequestHandler = function(req, res) {
    if (!_.isString(req.body)) {
      logger.captureError(logger.error('Wrong post message JWT'));
      return res.sendStatus(400);
    }
    jwt.verify(
      req.body,
      parent._conf.jwt.key,
      parent._conf.jwt.options,
      (err, decoded) => {
        if (err) {
          logger.captureError(logger.error('Wrong post message JWT', {err}));
          return res.status(401).send({status: 'error', err: "Wrong JWT"});
        }
        function wrongJWTContent() {
          logger.captureError(logger.error('Wrong post message JWT content', {decoded}));
          return res.status(401).send({status: 'error', err: "Wrong JWT content"});
        }
        if (!_.isArray(decoded)) {
          return wrongJWTContent();
        }
        var toSends = [];
        for (let i = 0; i < decoded.length; i++) {
          var toSend:any = {};

          // Test if there is a channel defined (required)
          if (!_.isString(decoded[i].channel)) {
            return wrongJWTContent();
          }
          toSend.channel = decoded[i].channel;

          if (_.isString(decoded[i].msg)) { // If this is a message
            toSend.msg = decoded[i].msg;
          }
          if (_.isString(decoded[i].ev)) { // If this is an event
            toSend.ev = decoded[i].ev;
            if (!_.isUndefined(decoded[i].data)) { // Include the data related to the event
              toSend.data = decoded[i].data;
            }
          }
          if (!_.isString(decoded[i].msg) && !_.isString(decoded[i].ev)) { // This is a wrong message, return an error
            return wrongJWTContent();
          }
          toSend.user = decoded[i].user;
          toSend.d = Math.floor(Date.now() / 1000);
          toSend.i = uuid.v4();
          toSends.push(toSend);
        }
        var redisMulti = parent._redisConnection.multi();

        for (let i = 0; i < toSends.length; i++) {
          redisMulti.publish('r_m_' + toSends[i].channel, JSON.stringify(toSends[i]));
          redisMulti.lpush('chatUp:room:r_' + toSends[i].channel, JSON.stringify(toSends[i]))
          redisMulti.ltrim('chatUp:room:r_' + toSends[i].channel, 0, parent._conf.messageHistory.size - 1)
          redisMulti.expire('chatUp:room:r_' + toSends[i].channel, parent._conf.messageHistory.expire)
        }

        redisMulti.exec((err) => {
          if (err) {
            logger.captureError(err);
            return res.status(500).send(err);
          }
          res.sendStatus(200);
        })
    });

  };

  return handler;
}

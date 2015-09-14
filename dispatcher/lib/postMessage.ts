import express = require('express');
import _ = require('lodash');
import {Dispatcher} from '../index';
import logger = require('../../common/logger');
import jwt = require('jsonwebtoken');

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
          wrongJWTContent();
        }
        var toSends = [];
        for (let i = 0; i < decoded.length; i++) {
          var toSend:any = {};
          if (!_.isString(decoded[i].channel) || !_.isString(decoded[i].msg) || !_.isObject(decoded[i].user)) {
            wrongJWTContent();
          }
          toSend.channel = decoded[i].channel;
          toSend.msg = decoded[i].msg;
          toSend.user = decoded[i].user;
          toSends.push(toSend);
        }
        var redisMulti = parent._redisConnection.multi();

        for (let i = 0; i < toSends.length; i++) {
          redisMulti.publish('r_' + toSends[i].channel, JSON.stringify(toSends[i]));
        }

        redisMulti.exec((err) => {
          if (err) {
            logger.captureError(err);
            res.status(500).send(err);
          }
          res.sendStatus(200);
        })
    });

  };

  return handler;
}

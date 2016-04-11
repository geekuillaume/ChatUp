import express = require('express');
import _ = require('lodash');
import {Dispatcher} from '../index';
import jwt = require('jsonwebtoken');
import logger = require('../../common/logger');
import redis = require('redis');
var debug = require('debug')('ChatUp:Dispatcher:BanHandler');

export function banHandler(parent: Dispatcher) {
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
          logger.captureError(err);
          debug('Authentication error: Wrong JWT', req.body, err);
          return res.status(401).send({status: 'error', err: "Wrong JWT"});
        }
        function wrongJWTContent() {
          logger.captureError(new Error('Ban: Wrong JWT content'));
          debug('Authentication error: Wrong JWT content', req.body, decoded);
          return res.status(400).send({status: 'error', err: "Wrong JWT content"});
        }
        if (!_.isArray(decoded)) {
          wrongJWTContent();
        }
        var toBans = [];
        for (let i = 0; i < decoded.length; i++) {
            var toBan:any = {};
            if (!_.isString(decoded[i].name) || !_.isString(decoded[i].channel)) {
              return wrongJWTContent();
            }
            toBan.name = decoded[i].name;
            toBan.channel = decoded[i].channel;
            if (_.isNumber(decoded[i].expire)) {
              toBan.expire = decoded[i].expire; // Duration in second before expiration of the ban
            }
            toBans.push(toBan);
        }

        var redisMulti:redis.RedisClient = <any>parent._redisConnection.multi();
        for (let i = 0; i < toBans.length; i++) {
          var keyName = 'chatUp:ban:' + toBans[i].channel + ':' + toBans[i].name;
          redisMulti.set(keyName, 1);
          if (toBans[i].expire) {
            redisMulti.expire(keyName, toBans[i].expire);
          } else {
            redisMulti.persist(keyName);
          }
          let banNotif = JSON.stringify({
            ev: "rmUserMsg",
            data: toBans[i].name
          });
          redisMulti.publish('r_m_' + toBans[i].channel, banNotif);
          redisMulti.lpush('chatUp:room:r_m_' + toBans[i].channel, banNotif)
          redisMulti.ltrim('chatUp:room:r_m_' + toBans[i].channel, 0, parent._conf.messageHistory.size - 1)
          redisMulti.expire('chatUp:room:r_m_' + toBans[i].channel, parent._conf.messageHistory.expire)
          debug("Banning %s of channel %s", toBans[i].name, toBans[i].channel);
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

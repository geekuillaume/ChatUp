import express = require('express');
import _ = require('lodash');
import {Dispatcher} from '../index';
import jwt = require('jsonwebtoken');
var debug = require('debug')('ChatUp:Dispatcher:BanHandler');

export function banHandler(parent: Dispatcher) {
  var handler: express.RequestHandler = function(req, res) {
0
    jwt.verify(
      req.body,
      parent._conf.jwt.key,
      parent._conf.jwt.options,
      (err, decoded) => {
        if (err) {
          debug('Authentication error: Wrong JWT', req.body, err);
          return res.status(401).send({status: 'error', err: "Wrong JWT"});
        }
        function wrongJWTContent() {
          debug('Authentication error: Wrong JWT content', req.body, decoded);
          return res.status(401).send({status: 'error', err: "Wrong JWT content"});
        }
        if (!_.isArray(decoded)) {
          wrongJWTContent();
        }
        var toBans = [];
        for (let i = 0; i < decoded.length; i++) {
            var toBan:any = {};
            if (!_.isString(decoded[i].name) || !_.isString(decoded[i].channel)) {
              wrongJWTContent();
            }
            toBan.name = decoded[i].name;
            toBan.channel = decoded[i].channel;
            if (_.isNumber(decoded[i].expire)) {
              toBan.expire = decoded[i].expire; // Duration in second before expiration of the ban
            }
            console.log(toBan);
            toBans.push(toBan);
        }
        var redisMulti = parent._redisConnection.multi();

        for (let i = 0; i < toBans.length; i++) {
          var keyName = 'chatUp:ban:' + toBans[i].channel + ':' + toBans[i].name;
          redisMulti.set(keyName, 1);
          if (toBans[i].expire) {
            redisMulti.expire(keyName, toBans[i].expire);
          } else {
            redisMulti.persist(keyName);
          }
        }

        redisMulti.exec((err) => {
          if (err) {
            res.status(500).send(err);
          }
          res.sendStatus(200);
        })
    });


  };

  return handler;
}

var got = require('got');
var debug = require('debug')('ChatUp:ChatWorker:master');
var uuid = require('node-uuid');
import {ChatWorker} from '../index';
import redis = require('redis');

export var registerWorker = function(worker: ChatWorker):Promise<void> {
  var redisConnection = redis.createClient(worker._conf.redis.port, worker._conf.redis.host);
  return validateWorkerInfos(worker).then(function() {
    return registerInRedis(worker, redisConnection);
  }).then(function() {
    startAlivePing(worker, redisConnection);
  });
};

function validateWorkerInfos(worker: ChatWorker): Promise<void> {
  return new Promise<void>(function(resolve, reject) {
    if (!worker._conf.uuid) {
      worker._conf.uuid = uuid.v4();
    }
    if (worker._conf.host) {
      return resolve();
    }
    got('https://api.ipify.org', function(err, ip) {
      if (err) {
        return reject(new Error("Couldn't get worker ip address"));
      }
      worker._conf.host = ip;
      resolve();
    });
  });
}

function registerInRedis(worker: ChatWorker, redisConnection: redis.RedisClient):Promise<void> {
  return new Promise<void>(function(resolve, reject) {
    var keyName = "chatUp:chatServer:" + worker._conf.uuid;
    redisConnection.multi()
      .hmset(keyName, {
        host: worker._conf.host,
        port: worker._conf.port
      })
      .pexpire(keyName, worker._conf.expireDelay)
      .exec((err, results) => {
        if (err) {
          return reject(err);
        }
        return resolve();
      });
  });
}

function startAlivePing(worker: ChatWorker, redisConnection: redis.RedisClient) {
  var interval = setInterval(function() {
    registerInRedis(worker, redisConnection);
  }, worker._conf.expireDelay * 0.8);
  interval.unref();
}

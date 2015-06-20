var got = require('got');
var debug = require('debug')('ChatUp:ChatWorker:master');
var uuid = require('node-uuid');
import url = require('url');
import _ = require('lodash');
import {ChatWorker} from '../index';
import redis = require('redis');
import superagent = require('superagent');

export var registerWorker = function(worker: ChatWorker):Promise<void> {
  var redisConnection = redis.createClient(worker._conf.redis.port, worker._conf.redis.host);
  return validateWorkerInfos(worker).then(function() {
    startWSHandlersMonitoring(worker);
  }).then(function() {
    startAlivePing(worker, redisConnection);
  });
};

function getNginxStats(worker: ChatWorker): Promise<any> {
  return new Promise<any>((resolve, reject) => {
      superagent.get('http://127.0.0.1:' + worker._conf.nginx.port + '/channels-stats?id=ALL')
        .end((err, res) => { // TODO: verify fix for channels containing " or \: https://github.com/wandenberg/nginx-push-stream-module/issues/186
          if (err) {
            debug('Error while getting nginx stats', err);
            return reject(err);
          }
          try {
            var rawStats = JSON.parse(res.text);
            var channelsStats = _.reduce(rawStats.infos, (stats, info:any) => {
              if (Number(info.subscribers) > 0) {
                stats[info.channel] = Number(info.subscribers);
              }
              return stats;
            }, {});
          } catch (err) {
            debug('Error while parsing nginx stats', err);
            return reject(err);
          }
          resolve(channelsStats);
        });
  });
}

function validateWorkerInfos(worker: ChatWorker): Promise<void> {
  return new Promise<void>(function(resolve, reject) {
    if (!worker._conf.uuid) {
      worker._conf.uuid = uuid.v4();
    }
    if (worker._conf.hostname) {
      return resolve();
    }
    got('https://api.ipify.org', function(err, ip) {
      if (err) {
        return reject(new Error("Couldn't get worker ip address"));
      }
      worker._conf.hostname = ip;
      resolve();
    });
  }).then(function() {
    worker._conf.host = url.format({
      hostname: worker._conf.hostname,
      protocol: worker._conf.ssl ? 'https': 'http',
      port: worker._conf.port.toString()
    })
  });
}

function startWSHandlersMonitoring(worker: ChatWorker) {
  _.each(worker._workers, (worker) => {
    worker.on('message', (message) => {
      if (!_.isObject(message) || message.type !== 'chatUp:stats') {
        return;
      }
      worker.stats = message.stats;
    })
  });
}

function registerInRedis(worker: ChatWorker, redisConnection: redis.RedisClient, stats:any):Promise<void> {
  return new Promise<void>(function(resolve, reject) {
    var keyName = "chatUp:chatServer:" + worker._conf.uuid;
    redisConnection.multi()
      .hmset(keyName, {
        host: worker._conf.host,
        connections: _(worker._workers).map('stats').map('connections').sum(),
        pubStats: JSON.stringify(_(worker._workers).map('stats').map('channels').flatten().compact().reduce((stats, channel:any) => {
          stats[channel.name] = _.union(stats[channel.name] || [], channel.publishers);
          return stats;
        }, {})),
        subStats: JSON.stringify(stats)
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
    getNginxStats(worker).then((nginxStats) => {
      return registerInRedis(worker, redisConnection, nginxStats);
    }).catch((err) => {
      console.log(err.stack);
      registerInRedis(worker, redisConnection, {err: 'nginxStats'});
    });
  }, worker._conf.expireDelay * 0.5);
  interval.unref();
}

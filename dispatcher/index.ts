import _ = require('lodash');
import https = require('https');
import http = require('http');
import cluster = require('cluster');
import express = require('express');
var bodyParser = require('body-parser');
import dispatchHandler = require('./lib/dispatchHandler');
import WorkersManager = require('./lib/workersManager');
import {statsHandler} from './lib/stats';
import {banHandler} from './lib/ban';
import redis = require('redis');
var bodyParser = require('body-parser');

export interface workerHost {
  host: string;
  connections: number;
  id: string;
  pubStats: any;
  subStats: any;
}

interface DispatcherConf {
  redis?: {
    port: number;
    host: string;
  };
  origins?: string;
  workerRefreshInterval?: number;
  threads?: number;
  ssl?: {
    key: string;
    cert: string;
  },
  jwt?: {
    key: string,
    options?: {
      algorithms: string[];
    }
  }
}

interface request extends express.Request {
  _chatUpData: Object;
}

export class Dispatcher {
  static defaultConf: DispatcherConf = {
    redis: {
      port: 6379,
      host: "127.0.0.1"
    },
    origins: '*',
    workerRefreshInterval: 2000,
    threads: require('os').cpus().length
  };

  _app: express.Application;
  _conf: DispatcherConf;
  _workersManager: WorkersManager;
  _redisConnection: redis.RedisClient;

  constructor(conf: DispatcherConf = {}) {
    this._conf = _.defaults(conf, Dispatcher.defaultConf);
    if (cluster.isMaster) {
      for (var i = 0; i < this._conf.threads; i += 1) {
        cluster.fork();
      }
      cluster.on('exit', function (worker) {
        console.log('Worker ' + worker.id + ' died, restarting another one');
        cluster.fork();
      });
    }

    this._app = express();
    this._app.use(bodyParser.json());
    this._app.use(this._handleError);
    this._app.use(this._allowCORS);
    this._redisConnection = redis.createClient(this._conf.redis.port, this._conf.redis.host);
    this._workersManager = new WorkersManager(this);
    this._app.post('/join/:channelName', dispatchHandler(this));
    this._app.get('/stats/:channelName', statsHandler(this));
    this._app.post('/ban', bodyParser.text(), banHandler(this));
  }

  _handleError:express.ErrorRequestHandler = function(err, req, res, next) {
    res.send(400, { err: err });
  }

  _allowCORS:express.RequestHandler = (req, res, next) => {
    res.header('Access-Control-Allow-Origin', this._conf.origins);
    res.header('Access-Control-Allow-Methods', 'POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type,X-Requested-With');
    next();
  }

  listen(port: number, callback: Function) {
    if (cluster.isMaster) {
      return;
    }
    var server;
    if (this._conf.ssl) {
      server = https.createServer(this._conf.ssl, this._app);
    } else {
      server = http.createServer(<any> this._app);
    }
    server.listen(port, callback);
  }
}

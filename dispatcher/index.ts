import _ = require('lodash');
import https = require('https');
import http = require('http');
import cluster = require('cluster');
import express = require('express');
var bodyParser = require('body-parser');
import dispatchHandler = require('./lib/dispatchHandler');
import WorkersManager = require('./lib/workersManager');
import {statsHandler} from './lib/stats';
import {messagesHistoryHandler} from './lib/messagesHistory';
import {banHandler} from './lib/ban';
import {postMessageHandler} from './lib/postMessage';
import redis = require('redis');
import logger = require('../common/logger');
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
  },
  sentry?: {
    dsn: String,
    options?: Object
  },
  messageHistory?: {
    size: number;
    expire: number;
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
    threads: require('os').cpus().length,
    messageHistory: {
      size: 100,
      expire: 30 * 24 * 60 * 60 // If a channel don't have any messages in 30 days, delete them from redis
    }
  };

  _app: express.Application;
  _conf: DispatcherConf;
  _workersManager: WorkersManager;
  _redisConnection: redis.RedisClient;

  constructor(conf: DispatcherConf = {}) {
    if (cluster.isMaster) {
      console.log("      _______ _     _ _______ _______ _     _  _____ ");
      console.log("      |       |_____| |_____|    |    |     | |_____]");
      console.log("      |_____  |     | |     |    |    |_____| |      ");
      console.log("                                                     ");
      console.log("");
      console.log("🎯  Preparing Dispatcher");
      console.log("");
    }

    this._conf = _.defaultsDeep(conf, Dispatcher.defaultConf);
    if (cluster.isMaster) {
      for (var i = 0; i < this._conf.threads; i += 1) {
        cluster.fork();
      }
      cluster.on('exit', function (worker) {
        console.log('Worker ' + worker.id + ' died, restarting another one');
        cluster.fork();
      });
    }

    if (this._conf.sentry) {
      logger.initClient(this._conf.sentry.dsn, this._conf.sentry.options);
    }

    this._app = express();
    this._app.use(bodyParser.json());
    this._app.use(this._handleError);
    this._app.use(this._allowCORS);
    this._redisConnection = redis.createClient(this._conf.redis.port, this._conf.redis.host);
    this._workersManager = new WorkersManager(this);
    this._app.post('/join/:channelName', dispatchHandler(this));
    this._app.get('/stats/:channelName', statsHandler(this));
    this._app.get('/messages/:channelName', messagesHistoryHandler(this));
    this._app.post('/post', bodyParser.text(), postMessageHandler(this));
    this._app.post('/ban', bodyParser.text(), banHandler(this));
  }

  _handleError:express.ErrorRequestHandler = function(err, req, res, next) {
    logger.captureError(err);
    res.send(400, { err: err });
  }

  _allowCORS:express.RequestHandler = (req, res, next) => {
    res.header('Access-Control-Allow-Origin', this._conf.origins);
    res.header('Access-Control-Allow-Methods', 'POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type,X-Requested-With');
    next();
  }

  registerPlugin = (pluginFct: (parent:Dispatcher) => void) => {
    pluginFct(this);
  }

  listen(port: number, callback: Function) {
    if (cluster.isMaster) {
      console.log("🙌  Dispatcher started !");
      console.log("👂  Listening on port %s", port);
      setTimeout(function() {
        console.log("");
        console.log("👌  Need help with ChatUp ? Contact me @ http://besson.co/")
      }, 2000);
      return;
    }
    var server;
    if (this._conf.ssl && this._conf.ssl.key) {
      server = https.createServer(this._conf.ssl, this._app);
    } else {
      server = http.createServer(<any> this._app);
    }
    server.listen(port, callback);
  }
}

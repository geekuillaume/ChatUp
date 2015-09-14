import _ = require('lodash');
var debug = require('debug')('ChatUp:ChatWorker:master');
import {sticky} from './lib/sticky';
import {WSHandler, WSUser} from './lib/WSHandler';
import {registerWorker} from './lib/workerManager';
import {Store} from './lib/store';
import cluster = require('cluster');
import logger = require('../common/logger');

export interface ChatWorkerConf {
  redis?: {
    port: number;
    host: string;
  };
  uuid?: string;
  port?: number;
  hostname?: string;
  origins?: string;
  threads?: number;
  sticky?: boolean;
  msgBufferDelay?: number;
  expireDelay?: number;
  host?: string;
  messageHistory?: {
    size: number;
    expire: number;
  },
  nginx?: {
    host: string;
    port: number;
  },
  jwt?: {
    key: string,
    options?: {
      algorithms: string[];
    }
  },
  ssl?: {
    key: string;
    cert: string;
  },
  sentry?: {
    dsn: String,
    options: Object
  }
};

export interface WSHandlerWorker extends cluster.Worker {
  stats?: {}
}

export interface ChatMessage {
  msg: string;
  user: {};
}

export class ChatWorker {

  static defaultConf: ChatWorkerConf = {
    redis: {
      port: 6379,
      host: "localhost"
    },
    origins: '*',
    threads: require('os').cpus().length,
    sticky: true,
    msgBufferDelay: 500,
    expireDelay: 2000,
    messageHistory: {
      size: 100,
      expire: 24 * 60
    },
    nginx: {
      host: '127.0.0.1',
      port: 42631
    }
  };

  _conf: ChatWorkerConf;

  _workers: WSHandlerWorker[];
  _server: any;
  _store: Store;

  constructor(conf: ChatWorkerConf) {
    debug('Init');
    this._conf = _.defaults(conf, ChatWorker.defaultConf);
    if (this._conf.sentry) {
      logger.initClient(this._conf.sentry.dsn, this._conf.sentry.options);
    }
    var infos = sticky(__dirname + '/lib/WSHandler.js', {
      sticky: this._conf.sticky,
      threads: this._conf.threads,
      data: this._conf
    });
    this._server = infos.server;
    this._workers = infos.workers;
    this._store = new Store(this._conf, true);
    debug('Finished Init');
  }

  listen():Promise<void> {
    return new Promise<void>((resolve, reject) => {
      debug('Starting listening on %s', this._conf.port);
      this._server.listen(this._conf.port || 0, (err) => {
        if (err) {
          logger.captureError(err);
          debug('Error while listening', err);
          return reject(err);
        }
        this._conf.port = this._conf.port || this._server.address().port;
        debug('Listening on %s', this._conf.port);
        debug('Registering the worker');
        registerWorker(this).then(resolve).catch(reject);
      });
    });
  }
}

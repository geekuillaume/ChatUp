import _ = require('lodash');
var debug = require('debug')('ChatUp:ChatWorker:master');
import cluster = require('cluster');
import redis = require('redis');
import {sticky} from './lib/sticky';
import {WSHandler, WSUser} from './lib/WSHandler';
import {registerWorker} from './lib/workerManager';
import {Store, Room} from './lib/store';
import logger = require('../common/logger');
import {startWSHandler} from './lib/WSHandler';
import {banMiddleware} from './lib/middleware';

export interface ChatWorkerConf {
  redis?: {
    port: number;
    host: string;
  };
  uuid?: string;
  port?: number;
  announcedPort?: number;
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
  announceSSL?: boolean;
  sentry?: {
    dsn: String,
    options: Object
  },
  middlewares?: ChatUpMiddleware[];
};

export interface WSHandlerWorker extends cluster.Worker {
  stats?: {}
}

export interface ChatMessage {
  msg: string;
  user: {};
}

export interface ChatUpMiddleware {(ctx: ChatUpMiddlewareContext, next: (err?: any)=>void): any}
export interface ChatUpMiddlewareContext {
  redisConnection: redis.RedisClient,
  msg: Object,
  user: Object,
  room: Room
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
    },
    port: 42633,
    announcedPort: 80,
    announceSSL: false,
    middlewares: []
  };

  _conf: ChatWorkerConf;

  _workers: WSHandlerWorker[];
  _server: any;
  _store: Store;


  constructor(conf: ChatWorkerConf) {
    debug('Init');
    if (cluster.isMaster) {
      console.log("      _______ _     _ _______ _______ _     _  _____ ");
      console.log("      |       |_____| |_____|    |    |     | |_____]");
      console.log("      |_____  |     | |     |    |    |_____| |      ");
      console.log("                                                     ");
      console.log("");
      console.log("👔  Preparing Worker");
      console.log("");
    }
    this._conf = _.defaultsDeep(conf, ChatWorker.defaultConf);
    if (this._conf.sentry) {
      logger.initClient(this._conf.sentry.dsn, this._conf.sentry.options);
    }
    this._conf.middlewares.push(banMiddleware);

    debug('Finished Init');
  }

  registerMiddleware(middleware: ChatUpMiddleware):void {
    this._conf.middlewares.push(middleware);
  }

  listen():Promise<void> {
    if (cluster.isMaster) {
      debug('Starting childrens');
      var infos = sticky(__dirname + '/lib/WSHandler.js', {
        sticky: this._conf.sticky,
        threads: this._conf.threads
      });
      this._server = infos.server;
      this._workers = infos.workers;
      this._store = new Store(this._conf, true);
      debug('Children started');
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
          console.log("🙌  Worker started !");
          console.log("👂  Listening on port %s and announcing %s:%s", this._conf.port, this._conf.hostname, this._conf.announcedPort);

          setTimeout(function() {
            console.log("");
            console.log("👌  Need help with ChatUp ? Contact me @ http://besson.co/")
          }, 2000);

        });
      });
    } else {
      return Promise.resolve(<any>startWSHandler(this._conf));
    }
  }
}

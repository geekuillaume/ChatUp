import _ = require('lodash');
var debug = require('debug')('ChatUp:ChatWorker:master');
import {sticky} from './lib/sticky';
import {WSHandler} from './lib/WSHandler';
import {registerWorker} from './lib/workerManager';
import {Store} from './lib/store';
import cluster = require('cluster');

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
  nginx?: {
    host: string;
    port: number;
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
    nginx: {
      host: '127.0.0.1',
      port: 42632
    }
  };

  _conf: ChatWorkerConf;

  _workers: WSHandlerWorker[];
  _server: any;
  _store: Store;

  constructor(conf: ChatWorkerConf) {
    debug('Init');
    this._conf = _.defaults(conf, ChatWorker.defaultConf);
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

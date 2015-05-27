import _ = require('lodash');
var debug = require('debug')('ChatUp:ChatWorker:master');
import {sticky} from './lib/sticky';
import {WSHandler} from './lib/WSHandler';
import {registerWorker} from './lib/workerManager';

export interface ChatWorkerConf {
  redis?: {
    port: number;
    host: string;
  };
  uuid?: string;
  port?: number;
  host?: string;
  origins?: string;
  threads?: number;
  sticky?: boolean;
  msgBufferDelay?: number;
  expireDelay?: number;
};

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
    expireDelay: 2000
  };

  _conf: ChatWorkerConf;

  _server: any;

  constructor(conf: ChatWorkerConf) {
    debug('Init');
    this._conf = _.defaults(conf, ChatWorker.defaultConf);
    this._server = sticky(__dirname + '/lib/WSHandler.js', {
      sticky: this._conf.sticky,
      threads: this._conf.threads,
      data: this._conf
    });
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
        debug('Listening on %s', this._conf.port);
        this._conf.port = this._conf.port || this._server.address().port;
        debug('Registering the worker');
        registerWorker(this).then(resolve).catch(reject);
      });
    });
  }
}

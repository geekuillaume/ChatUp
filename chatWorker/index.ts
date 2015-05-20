import sticky = require('./lib/sticky');
import _ = require('lodash');
import cluster = require('cluster');
import WSHandler = require('./lib/WSHandler');

var debug = cluster.isMaster ? require('debug')('ChatUp:ChatWorker:master') : _.noop;

interface ChatWorkerConf {
  redis?: {
    port: number;
    host: string;
  };
  port?: number;
  origins?: string;
  threads?: number;
  sticky?: boolean;
};

export class ChatWorker {

  static defaultConf: ChatWorkerConf = {
    redis: {
      port: 6379,
      host: "localhost"
    },
    port: 8001,
    origins: '*',
    threads: require('os').cpus().length,
    sticky: true
  };

  _conf: ChatWorkerConf;

  _server: any;

  constructor(conf: ChatWorkerConf) {
    debug('Init');
    this._conf = _.defaults(conf, ChatWorker.defaultConf);
    this._server = sticky(() => {
      var handler = new WSHandler(this);
      return handler.server;
    }, {
      sticky: this._conf.sticky,
      threads: this._conf.threads
    });
    debug('Finished Init');
  }

  listen():Promise<void> {
    return new Promise<void>((resolve, reject) => {
      debug('Starting listening on %s', this._conf.port);
      this._server.listen(this._conf.port, (err) => {
        if (err) {
          debug('Error while listening', err);
          return reject(err);
        }
        debug('Listening on %s', this._conf.port);
        resolve();
      });
    });
  }
}

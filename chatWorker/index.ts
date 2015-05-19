import _ = require('lodash');
import WSHandler = require('./lib/WSHandler');


interface ChatWorkerConf {
  redis?: {
    port: number;
    host: string;
  };
  port?: number;
  origins?: string;
};

export class ChatWorker {

  static defaultConf: ChatWorkerConf = {
    redis: {
      port: 6379,
      host: "localhost"
    },
    port: 8001,
    origins: '*'
  };

  _conf: ChatWorkerConf;
  _wsHandler: WSHandler;

  constructor(conf: ChatWorkerConf) {
    this._conf = _.defaults(conf, ChatWorker.defaultConf);
    this._wsHandler = new WSHandler(this);
  }

  listen():Promise<void> {
    return this._wsHandler.listen();
  }
}

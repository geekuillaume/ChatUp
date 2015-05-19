import express = require('express');
import _ = require('lodash');
import dispatchHandler = require('./lib/dispatchHandler');
import WorkersManager = require('./lib/workersManager');

export interface DispatcherWorkerHost {
  port: number;
  host: string;
}

interface DispatcherConf {
  redis?: {
    port: number;
    host: string;
  };
  workers?: DispatcherWorkerHost[];
}

interface request extends express.Request {
  _chatUpData: Object;
}

export class Dispatcher {
  static defaultConf: DispatcherConf = {
    redis: {
      port: 6780,
      host: "127.0.0.1"
    },
    workers: []
  };

  _router: express.Router;
  _conf: DispatcherConf;
  _workersManager: WorkersManager;

  constructor(conf: DispatcherConf) {
    this._router = express.Router();
    this._conf = _.defaults(conf, Dispatcher.defaultConf);
    this._router.use(this._handleError);
    this._workersManager = new WorkersManager(this);
  }

  _handleError:express.ErrorRequestHandler = function(err, req, res, next) {
    res.send(400, { err: err });
  }

  use(middleware) {
    this._router.post('/', function (req: request, res, next) {
      req._chatUpData = req._chatUpData || {};
      middleware(req, req._chatUpData, next);
    });
  }

  register(app: express.Application) {
    this._router.post('/', dispatchHandler(this));
    app.use(this._router);
  }
}

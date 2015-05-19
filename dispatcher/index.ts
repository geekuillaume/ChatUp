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
  origins?: string;
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
    workers: [],
    origins: '*'
  };

  _router: express.Router;
  _conf: DispatcherConf;
  _workersManager: WorkersManager;

  constructor(conf: DispatcherConf) {
    this._router = express.Router();
    this._conf = _.defaults(conf, Dispatcher.defaultConf);
    this._router.use(this._handleError);
    this._router.use(this._allowCORS);
    this._workersManager = new WorkersManager(this);
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

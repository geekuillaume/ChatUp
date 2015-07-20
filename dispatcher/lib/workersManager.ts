import Dispatcher = require('../index');
import _ = require('lodash');
import util = require('util');
var debug = require('debug')('ChatUp:Dispatcher');

class WorkersManager {
  _parent: Dispatcher.Dispatcher;

  _workers: Dispatcher.workerHost[];

  constructor(parent: Dispatcher.Dispatcher) {
    this._parent = parent;
    this._workerRefresh();
  }

  _workerRefresh = () => {
    this._parent._redisConnection.keys('chatUp:chatServer:*', (err, workersName:string[]) => {
      if (err) {
        setTimeout(this._workerRefresh, this._parent._conf.workerRefreshInterval).unref();
        return console.error('Error on redis command:', err);
      }
      var multi = this._parent._redisConnection.multi();
      _.each(workersName, (name) => {multi.hgetall(name)});
      multi.exec((err, workersInfo:Dispatcher.workerHost[]) => {
        if (err) {
          console.error('Error on redis command:', err);
        } else {
          this._workers = workersInfo;
          _.each(this._workers, (worker, i) => {
            worker.id = workersName[i];
            worker.connections = Number(worker.connections);
            worker.pubStats = JSON.parse(worker.pubStats);
            worker.subStats = JSON.parse(worker.subStats);
          });
          debug('Workers:', util.inspect(this._workers, {depth: null}));
          debug('Refreshed and got %s workers', this._workers.length);
        }
        setTimeout(this._workerRefresh, this._parent._conf.workerRefreshInterval).unref();
      });
    });
  }

  getAvailable({excludeId: excludeId}): Promise<Dispatcher.workerHost> {
    return new Promise<Dispatcher.workerHost>((resolve, reject) => {

      var workers = <Dispatcher.workerHost[]>_(this._workers).reject({id: excludeId}).sortBy('connections').value();

      var worker = workers[0];

      if (worker) {
        debug('Found one worker at host %s', worker.host);
        worker.connections++;
      }
      resolve(worker); // If no worker, we send nothing and the caller now that no worker is available
    });
  }

  getWorkers = ():Dispatcher.workerHost[] => {
    return this._workers;
  }
};

export = WorkersManager;

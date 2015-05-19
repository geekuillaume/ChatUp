import Dispatcher = require('../index');
import _ = require('lodash');

class WorkersManager {
  _parent: Dispatcher.Dispatcher;

  constructor(parent: Dispatcher.Dispatcher) {
    this._parent = parent;
  }

  getAvailable(): Promise<Dispatcher.DispatcherWorkerHost> {
    return new Promise<Dispatcher.DispatcherWorkerHost>((resolve, reject) => {

      var worker = <Dispatcher.DispatcherWorkerHost>_.sample(this._parent._conf.workers);

      if (worker) {
        resolve(worker);
      }
      else {
        reject(new Error('No worker available'));
      }
    });
  }
};

export = WorkersManager;

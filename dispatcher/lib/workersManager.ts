import Dispatcher = require('../index');
import _ = require('lodash');
import redis = require('redis');

class WorkersManager {
  _parent: Dispatcher.Dispatcher;
  _redisConnection: redis.RedisClient;

  _workers: {[index: string]: Dispatcher.workerHost};

  constructor(parent: Dispatcher.Dispatcher) {
    this._parent = parent;
    this._redisConnection = redis.createClient(this._parent._conf.redis.port, this._parent._conf.redis.host);
    this._workerRefresh();
  }

  _workerRefresh = () => {
    this._redisConnection.keys('chatUp:chatServer:*', (err, workersName:string[]) => {
      if (err) {
        setTimeout(this._workerRefresh, this._parent._conf.workerRefreshInterval).unref();
        return console.error('Error on redis command:', err);
      }
      var multi = this._redisConnection.multi();
      _.each(workersName, (name) => {multi.hgetall(name)});
      multi.exec((err, workersInfo:Dispatcher.workerHost[]) => {
        if (err) {
          console.error('Error on redis command:', err);
        } else {
          this._workers = {};
          _.each(workersName, (name, i) => {
            this._workers[name] = workersInfo[i];
            this._workers[name].port = Number(workersInfo[i].port);
          });
          console.log(this._workers);
        }
        setTimeout(this._workerRefresh, this._parent._conf.workerRefreshInterval).unref();
      });
    });
  }

  getAvailable(): Promise<Dispatcher.workerHost> {
    return new Promise<Dispatcher.workerHost>((resolve, reject) => {

      var worker = <Dispatcher.workerHost>_.sample(this._workers);

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

import Dispatcher = require('../index');
import _ = require('lodash');
import redis = require('redis');
var debug = require('debug')('ChatUp:Dispatcher');

class WorkersManager {
  _parent: Dispatcher.Dispatcher;
  _redisConnection: redis.RedisClient;

  _workers: Dispatcher.workerHost[];

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
          this._workers = workersInfo;
          _.each(this._workers, (worker) => {
            worker.connections = Number(worker.connections);
          });
          console.log(this._workers);
          debug('Refreshed and got %s workers', this._workers.length);
        }
        setTimeout(this._workerRefresh, this._parent._conf.workerRefreshInterval).unref();
      });
    });
  }

  getAvailable(): Promise<Dispatcher.workerHost> {
    return new Promise<Dispatcher.workerHost>((resolve, reject) => {

      var worker = <Dispatcher.workerHost>_(this._workers).sortBy('connections').first();
      console.log(_(this._workers).sortBy('connections').value());

      // var worker = <Dispatcher.workerHost>_.sample(this._workers);
      debug('Found one worker at host %s', worker.host);
      if (worker) {
        resolve(worker);
      }
      else {
        reject(new Error('No worker available'));
      }
      worker.connections++;
      console.log('worker.connections', worker.connections);
    });
  }
};

export = WorkersManager;

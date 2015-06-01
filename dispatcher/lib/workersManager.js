var _ = require('lodash');
var redis = require('redis');
var debug = require('debug')('ChatUp:Dispatcher');
var WorkersManager = (function () {
    function WorkersManager(parent) {
        var _this = this;
        this._workerRefresh = function () {
            _this._redisConnection.keys('chatUp:chatServer:*', function (err, workersName) {
                if (err) {
                    setTimeout(_this._workerRefresh, _this._parent._conf.workerRefreshInterval).unref();
                    return console.error('Error on redis command:', err);
                }
                var multi = _this._redisConnection.multi();
                _.each(workersName, function (name) { multi.hgetall(name); });
                multi.exec(function (err, workersInfo) {
                    if (err) {
                        console.error('Error on redis command:', err);
                    }
                    else {
                        _this._workers = workersInfo;
                        _.each(_this._workers, function (worker) {
                            worker.connections = Number(worker.connections);
                        });
                        console.log(_this._workers);
                        debug('Refreshed and got %s workers', _this._workers.length);
                    }
                    setTimeout(_this._workerRefresh, _this._parent._conf.workerRefreshInterval).unref();
                });
            });
        };
        this._parent = parent;
        this._redisConnection = redis.createClient(this._parent._conf.redis.port, this._parent._conf.redis.host);
        this._workerRefresh();
    }
    WorkersManager.prototype.getAvailable = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var workers = _(_this._workers).sortBy('connections').value();
            console.log(workers);
            var worker = workers[0];
            if (worker) {
                debug('Found one worker at host %s', worker.host);
                worker.connections++;
            }
            resolve(worker);
        });
    };
    return WorkersManager;
})();
;
module.exports = WorkersManager;

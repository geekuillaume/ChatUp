var _ = require('lodash');
var util = require('util');
var logger = require('../../common/logger');
var debug = require('debug')('ChatUp:Dispatcher');
var WorkersManager = (function () {
    function WorkersManager(parent) {
        var _this = this;
        this._workerRefresh = function () {
            _this._parent._redisConnection.keys('chatUp:chatServer:*', function (err, workersName) {
                if (err) {
                    logger.captureError(err);
                    setTimeout(_this._workerRefresh, _this._parent._conf.workerRefreshInterval).unref();
                    return console.error('Error on redis command:', err);
                }
                var multi = _this._parent._redisConnection.multi();
                _.each(workersName, function (name) { multi.hgetall(name); });
                multi.exec(function (err, workersInfo) {
                    if (err) {
                        logger.captureError(err);
                        console.error('Error on redis command:', err);
                    }
                    else {
                        _this._workers = workersInfo;
                        _.each(_this._workers, function (worker, i) {
                            worker.id = workersName[i];
                            worker.connections = Number(worker.connections);
                            worker.pubStats = JSON.parse(worker.pubStats);
                            worker.subStats = JSON.parse(worker.subStats);
                        });
                        debug('Workers:', util.inspect(_this._workers, { depth: null }));
                        debug('Refreshed and got %s workers', _this._workers.length);
                    }
                    setTimeout(_this._workerRefresh, _this._parent._conf.workerRefreshInterval).unref();
                });
            });
        };
        this.getWorkers = function () {
            return _this._workers;
        };
        this._parent = parent;
        this._workerRefresh();
    }
    WorkersManager.prototype.getAvailable = function (_a) {
        var _this = this;
        var excludeId = _a.excludeId;
        return new Promise(function (resolve, reject) {
            var workers = _(_this._workers).reject({ id: excludeId }).sortBy('connections').value();
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

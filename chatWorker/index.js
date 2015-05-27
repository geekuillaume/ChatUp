var _ = require('lodash');
var debug = require('debug')('ChatUp:ChatWorker:master');
var sticky_1 = require('./lib/sticky');
var workerManager_1 = require('./lib/workerManager');
;
var ChatWorker = (function () {
    function ChatWorker(conf) {
        debug('Init');
        this._conf = _.defaults(conf, ChatWorker.defaultConf);
        this._server = sticky_1.sticky(__dirname + '/lib/WSHandler.js', {
            sticky: this._conf.sticky,
            threads: this._conf.threads,
            data: this._conf
        });
        debug('Finished Init');
    }
    ChatWorker.prototype.listen = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            debug('Starting listening on %s', _this._conf.port);
            _this._server.listen(_this._conf.port || 0, function (err) {
                if (err) {
                    debug('Error while listening', err);
                    return reject(err);
                }
                debug('Listening on %s', _this._conf.port);
                _this._conf.port = _this._conf.port || _this._server.address().port;
                debug('Registering the worker');
                workerManager_1.registerWorker(_this).then(resolve).catch(reject);
            });
        });
    };
    ChatWorker.defaultConf = {
        redis: {
            port: 6379,
            host: "localhost"
        },
        origins: '*',
        threads: require('os').cpus().length,
        sticky: true,
        msgBufferDelay: 500,
        expireDelay: 2000
    };
    return ChatWorker;
})();
exports.ChatWorker = ChatWorker;

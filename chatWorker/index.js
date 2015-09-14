var _ = require('lodash');
var debug = require('debug')('ChatUp:ChatWorker:master');
var sticky_1 = require('./lib/sticky');
var workerManager_1 = require('./lib/workerManager');
var store_1 = require('./lib/store');
var logger = require('../common/logger');
;
var ChatWorker = (function () {
    function ChatWorker(conf) {
        debug('Init');
        this._conf = _.defaults(conf, ChatWorker.defaultConf);
        if (this._conf.sentry) {
            logger.initClient(this._conf.sentry.dsn, this._conf.sentry.options);
        }
        var infos = sticky_1.sticky(__dirname + '/lib/WSHandler.js', {
            sticky: this._conf.sticky,
            threads: this._conf.threads,
            data: this._conf
        });
        this._server = infos.server;
        this._workers = infos.workers;
        this._store = new store_1.Store(this._conf, true);
        debug('Finished Init');
    }
    ChatWorker.prototype.listen = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            debug('Starting listening on %s', _this._conf.port);
            _this._server.listen(_this._conf.port || 0, function (err) {
                if (err) {
                    logger.captureError(err);
                    debug('Error while listening', err);
                    return reject(err);
                }
                _this._conf.port = _this._conf.port || _this._server.address().port;
                debug('Listening on %s', _this._conf.port);
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
        expireDelay: 2000,
        messageHistory: {
            size: 100,
            expire: 24 * 60
        },
        nginx: {
            host: '127.0.0.1',
            port: 42631
        }
    };
    return ChatWorker;
})();
exports.ChatWorker = ChatWorker;

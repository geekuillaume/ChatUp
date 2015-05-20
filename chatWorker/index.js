var sticky = require('./lib/sticky');
var _ = require('lodash');
var cluster = require('cluster');
var WSHandler = require('./lib/WSHandler');
var debug = cluster.isMaster ? require('debug')('ChatUp:ChatWorker:master') : _.noop;
;
var ChatWorker = (function () {
    function ChatWorker(conf) {
        var _this = this;
        debug('Init');
        this._conf = _.defaults(conf, ChatWorker.defaultConf);
        this._server = sticky(function () {
            var handler = new WSHandler(_this);
            return handler.server;
        }, {
            sticky: this._conf.sticky,
            threads: this._conf.threads
        });
        debug('Finished Init');
    }
    ChatWorker.prototype.listen = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            debug('Starting listening on %s', _this._conf.port);
            _this._server.listen(_this._conf.port, function (err) {
                if (err) {
                    debug('Error while listening', err);
                    return reject(err);
                }
                debug('Listening on %s', _this._conf.port);
                resolve();
            });
        });
    };
    ChatWorker.defaultConf = {
        redis: {
            port: 6379,
            host: "localhost"
        },
        port: 8001,
        origins: '*',
        threads: require('os').cpus().length,
        sticky: true
    };
    return ChatWorker;
})();
exports.ChatWorker = ChatWorker;

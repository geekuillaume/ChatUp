var sticky_1 = require('./lib/sticky');
var _ = require('lodash');
var cluster = require('cluster');
var debug = cluster.isMaster ? require('debug')('ChatUp:ChatWorker:master') : _.noop;
;
var ChatMessage = (function () {
    function ChatMessage() {
    }
    return ChatMessage;
})();
exports.ChatMessage = ChatMessage;
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
        sticky: true,
        msgBufferDelay: 500
    };
    return ChatWorker;
})();
exports.ChatWorker = ChatWorker;

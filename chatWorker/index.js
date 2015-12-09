"use strict";
var _ = require('lodash');
var debug = require('debug')('ChatUp:ChatWorker:master');
var cluster = require('cluster');
var sticky_1 = require('./lib/sticky');
var workerManager_1 = require('./lib/workerManager');
var store_1 = require('./lib/store');
var logger = require('../common/logger');
var WSHandler_1 = require('./lib/WSHandler');
var middleware_1 = require('./lib/middleware');
;
var ChatWorker = (function () {
    function ChatWorker(conf) {
        debug('Init');
        if (cluster.isMaster) {
            console.log("      _______ _     _ _______ _______ _     _  _____ ");
            console.log("      |       |_____| |_____|    |    |     | |_____]");
            console.log("      |_____  |     | |     |    |    |_____| |      ");
            console.log("                                                     ");
            console.log("");
            console.log("👔  Preparing Worker");
            console.log("");
        }
        this._conf = _.defaultsDeep(conf, ChatWorker.defaultConf);
        if (this._conf.sentry) {
            logger.initClient(this._conf.sentry.dsn, this._conf.sentry.options);
        }
        this._conf.middlewares.push(middleware_1.banMiddleware);
        debug('Finished Init');
    }
    ChatWorker.prototype.registerMiddleware = function (middleware) {
        this._conf.middlewares.push(middleware);
    };
    ChatWorker.prototype.listen = function () {
        var _this = this;
        if (cluster.isMaster) {
            debug('Starting childrens');
            var infos = sticky_1.sticky(__dirname + '/lib/WSHandler.js', {
                sticky: this._conf.sticky,
                threads: this._conf.threads
            });
            this._server = infos.server;
            this._workers = infos.workers;
            this._store = new store_1.Store(this._conf, true);
            debug('Children started');
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
                    console.log("🙌  Worker started !");
                    console.log("👂  Listening on port %s and announcing %s:%s", _this._conf.port, _this._conf.hostname, _this._conf.announcedPort);
                    setTimeout(function () {
                        console.log("");
                        console.log("👌  Need help with ChatUp ? Contact me @ http://besson.co/");
                    }, 2000);
                });
            });
        }
        else {
            return Promise.resolve(WSHandler_1.startWSHandler(this._conf));
        }
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
        },
        port: 42633,
        announcedPort: 80,
        announceSSL: false,
        middlewares: []
    };
    return ChatWorker;
})();
exports.ChatWorker = ChatWorker;

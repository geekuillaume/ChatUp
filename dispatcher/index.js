"use strict";
var _ = require('lodash');
var https = require('https');
var http = require('http');
var cluster = require('cluster');
var express = require('express');
var bodyParser = require('body-parser');
var dispatchHandler = require('./lib/dispatchHandler');
var WorkersManager = require('./lib/workersManager');
var stats_1 = require('./lib/stats');
var messagesHistory_1 = require('./lib/messagesHistory');
var ban_1 = require('./lib/ban');
var postMessage_1 = require('./lib/postMessage');
var redis = require('redis');
var logger = require('../common/logger');
var bodyParser = require('body-parser');
var Dispatcher = (function () {
    function Dispatcher(conf) {
        var _this = this;
        if (conf === void 0) { conf = {}; }
        this._handleError = function (err, req, res, next) {
            logger.captureError(err);
            res.send(400, { err: err });
        };
        this._allowCORS = function (req, res, next) {
            res.header('Access-Control-Allow-Origin', _this._conf.origins);
            res.header('Access-Control-Allow-Methods', 'POST');
            res.header('Access-Control-Allow-Headers', 'Content-Type,X-Requested-With');
            next();
        };
        if (cluster.isMaster) {
            console.log("      _______ _     _ _______ _______ _     _  _____ ");
            console.log("      |       |_____| |_____|    |    |     | |_____]");
            console.log("      |_____  |     | |     |    |    |_____| |      ");
            console.log("                                                     ");
            console.log("");
            console.log("🎯  Preparing Dispatcher");
            console.log("");
        }
        this._conf = _.defaultsDeep(conf, Dispatcher.defaultConf);
        if (cluster.isMaster) {
            for (var i = 0; i < this._conf.threads; i += 1) {
                cluster.fork();
            }
            cluster.on('exit', function (worker) {
                console.log('Worker ' + worker.id + ' died, restarting another one');
                cluster.fork();
            });
        }
        if (this._conf.sentry) {
            logger.initClient(this._conf.sentry.dsn, this._conf.sentry.options);
        }
        this._app = express();
        this._app.use(bodyParser.json());
        this._app.use(this._handleError);
        this._app.use(this._allowCORS);
        this._redisConnection = redis.createClient(this._conf.redis.port, this._conf.redis.host);
        this._workersManager = new WorkersManager(this);
        this._app.post('/join/:channelName', dispatchHandler(this));
        this._app.get('/stats/:channelName', stats_1.statsHandler(this));
        this._app.get('/messages/:channelName', messagesHistory_1.messagesHistoryHandler(this));
        this._app.post('/post', bodyParser.text(), postMessage_1.postMessageHandler(this));
        this._app.post('/ban', bodyParser.text(), ban_1.banHandler(this));
    }
    Dispatcher.prototype.listen = function (port, callback) {
        if (cluster.isMaster) {
            console.log("🙌  Dispatcher started !");
            console.log("👂  Listening on port %s", port);
            setTimeout(function () {
                console.log("");
                console.log("👌  Need help with ChatUp ? Contact me @ http://besson.co/");
            }, 2000);
            return;
        }
        var server;
        if (this._conf.ssl && this._conf.ssl.key) {
            server = https.createServer(this._conf.ssl, this._app);
        }
        else {
            server = http.createServer(this._app);
        }
        server.listen(port, callback);
    };
    Dispatcher.defaultConf = {
        redis: {
            port: 6379,
            host: "127.0.0.1"
        },
        origins: '*',
        workerRefreshInterval: 2000,
        threads: require('os').cpus().length
    };
    return Dispatcher;
})();
exports.Dispatcher = Dispatcher;

var _ = require('lodash');
var https = require('https');
var http = require('http');
var cluster = require('cluster');
var express = require('express');
var bodyParser = require('body-parser');
var dispatchHandler = require('./lib/dispatchHandler');
var WorkersManager = require('./lib/workersManager');
var stats_1 = require('./lib/stats');
var ban_1 = require('./lib/ban');
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
        this._conf = _.defaults(conf, Dispatcher.defaultConf);
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
        this._app.post('/ban', bodyParser.text(), ban_1.banHandler(this));
    }
    Dispatcher.prototype.listen = function (port, callback) {
        if (cluster.isMaster) {
            return;
        }
        var server;
        if (this._conf.ssl) {
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

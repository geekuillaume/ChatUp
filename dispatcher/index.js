var express = require('express');
var _ = require('lodash');
var dispatchHandler = require('./lib/dispatchHandler');
var WorkersManager = require('./lib/workersManager');
var Dispatcher = (function () {
    function Dispatcher(conf) {
        this._handleError = function (err, req, res, next) {
            res.send(400, { err: err });
        };
        this._router = express.Router();
        this._conf = _.defaults(conf, Dispatcher.defaultConf);
        this._router.use(this._handleError);
        this._workersManager = new WorkersManager(this);
    }
    Dispatcher.prototype.use = function (middleware) {
        this._router.post('/', function (req, res, next) {
            req._chatUpData = req._chatUpData || {};
            middleware(req, req._chatUpData, next);
        });
    };
    Dispatcher.prototype.register = function (app) {
        this._router.post('/', dispatchHandler(this));
        app.use(this._router);
    };
    Dispatcher.defaultConf = {
        redis: {
            port: 6780,
            host: "127.0.0.1"
        },
        workers: []
    };
    return Dispatcher;
})();
exports.Dispatcher = Dispatcher;

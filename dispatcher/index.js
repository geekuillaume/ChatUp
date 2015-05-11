var express = require('express');
var _ = require('lodash');
var dispatchHandler = require('./lib/dispatchHandler');
var ChatUpDispatcher = (function () {
    function ChatUpDispatcher(conf) {
        this.handleError = function (err, req, res, next) {
            res.send(400, { err: err });
        };
        this.router = express.Router();
        this.conf = _.defaults(ChatUpDispatcher.defaultConf, conf);
        this.router.use(this.handleError);
    }
    ChatUpDispatcher.prototype.use = function (middleware) {
        this.router.post('/', function (req, res, next) {
            req._chatUpData = req._chatUpData || {};
            middleware(req, req._chatUpData, next);
        });
    };
    ChatUpDispatcher.prototype.register = function (app) {
        this.router.post('/', dispatchHandler);
        app.use(this.router);
    };
    ChatUpDispatcher.defaultConf = {
        redis: {
            port: 6780,
            host: "127.0.0.1"
        }
    };
    return ChatUpDispatcher;
})();
module.exports = ChatUpDispatcher;

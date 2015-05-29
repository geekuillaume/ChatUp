var request = require('superagent');
var io = require('socket.io-client');
var _ = require('lodash');
var es6shim = require('es6-shim');
var now = require('performance-now');
var PushStream = require('./nginx-pushstream.js');
var url = require('url');
var ChatUp = (function () {
    function ChatUp(conf) {
        var _this = this;
        this.init = function () {
            if (_this._initPromise)
                return _this._initPromise;
            var promise = _this._initPromise = _this._getChatWorker().then(_this._connectSocket);
            if (_this._conf.userInfo) {
                promise = promise.then(_this._authenticate);
            }
            return promise.then(_this._join)
                .then(function () {
                return _this;
            });
        };
        this.say = function (message) {
            return _this._waitInit(function () {
                return new Promise(function (resolve, reject) {
                    _this._stats.msgSent++;
                    var start = now();
                    _this._socket.emit('say', { msg: message }, function (response) {
                        _this._stats.latency = now() - start;
                        if (!_this._isCorrectReponse(response, reject))
                            return;
                        return resolve();
                    });
                });
            });
        };
        this.onMsg = function (handler) {
            _this._msgHandlers.push(handler);
        };
        this._handleMessagesBuffer = function (data) {
            var messages;
            try {
                messages = JSON.parse(data);
            }
            catch (e) { }
            for (var _i = 0; _i < messages.length; _i++) {
                var message = messages[_i];
                _this._stats.msgReceived++;
                for (var _a = 0, _b = _this._msgHandlers; _a < _b.length; _a++) {
                    var handler = _b[_a];
                    handler(message);
                }
            }
        };
        this._waitInit = function (fct) {
            return _this._initPromise.then(function () {
                return fct();
            });
        };
        this._isCorrectReponse = function (message, rejectFct) {
            if (message === 'ok') {
                return true;
            }
            if (!_.isObject(message)) {
                rejectFct(new Error('Wrong return from the server: ' + message));
                return false;
            }
            if (message.status !== 'ok') {
                rejectFct(new Error(message.err));
                return false;
            }
            return true;
        };
        this._authenticate = function () {
            return new Promise(function (resolve, reject) {
                _this._socket.emit('auth', _this._conf.userInfo, function (response) {
                    if (!_this._isCorrectReponse(response, reject))
                        return;
                    return resolve();
                });
            });
        };
        this._join = function () {
            return new Promise(function (resolve, reject) {
                _this._socket.emit('join', { room: _this._conf.room }, function (response) {
                    if (!_this._isCorrectReponse(response, reject))
                        return;
                    return resolve();
                });
            });
        };
        this._connectSocket = function (worker) {
            _this._pushStream = new PushStream.PushStream({
                host: url.parse(worker.host).hostname,
                port: _this._conf.nginxPort,
                modes: 'websocket|eventsource|longpolling'
            });
            _this._pushStream.onmessage = _this._handleMessagesBuffer;
            _this._pushStream.addChannel(_this._conf.room);
            _this._pushStream.connect();
            return new Promise(function (resolve, reject) {
                _this._socket = io(worker.host, _this._conf.socketIO);
                _this._socket.on('connect', function () {
                    resolve();
                });
                _this._socket.on('connect_error', function (err) {
                    console.error('Couldn\'t connect to socket, retrying', err);
                    _.after(2, function () {
                        reject(err);
                    });
                });
            });
        };
        this._getChatWorker = function () {
            return new Promise(function (resolve, reject) {
                request.post(_this._conf.dispatcherURL)
                    .end(function (err, res) {
                    if (err) {
                        return reject(err);
                    }
                    resolve(res.body);
                });
            });
        };
        this._conf = conf;
        _.defaults(conf, ChatUp.defaultConf);
        _.defaults(conf.socketIO, ChatUp.defaultConf.socketIO);
        this._msgHandlers = [];
        this._stats = {
            msgSent: 0,
            msgReceived: 0,
            latency: Infinity
        };
    }
    Object.defineProperty(ChatUp.prototype, "stats", {
        get: function () {
            return this._stats;
        },
        enumerable: true,
        configurable: true
    });
    ChatUp.defaultConf = {
        dispatcherURL: '/dispatcher',
        userInfo: {},
        room: 'defaultRoom',
        socketIO: {
            timeout: 5000
        },
        nginxPort: 42632
    };
    return ChatUp;
})();
module.exports = ChatUp;

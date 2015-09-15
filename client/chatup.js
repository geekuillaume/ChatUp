var request = require('superagent');
var io = require('socket.io-client');
var _ = require('lodash');
var es6shim = require('es6-shim');
var now = require('performance-now');
var PushStream = require('./lib/nginx-pushstream.js');
var url = require('url');
var helpers_1 = require('./lib/helpers');
var ChatUpProtocol = (function () {
    function ChatUpProtocol(conf) {
        var _this = this;
        this._msgHandlers = [];
        this._evHandlers = [];
        this._userCountUpdateHandlers = [];
        this._dispatcherErrorCount = 0;
        this._pubConnected = false;
        this._lastReceivedMessageTime = new Date(0);
        this.stats = {
            msgSent: 0,
            msgReceived: 0,
            latency: Infinity,
            pubCount: 0,
            subCount: 0
        };
        this._status = 'disconnected';
        this._statusChangeHandler = [];
        this.onStatusChange = function (handler) {
            _this._statusChangeHandler.push(handler);
        };
        this.init = function () {
            if (_this._initPromise && !_this._error)
                return _this._initPromise;
            if (!_this._error)
                _this.status = 'connecting';
            _this._initPromise = _this._getChatWorker()
                .then(_this._connectSub)
                .then(function () {
                _this.status = 'connected';
                _this._updateUserCountLoop();
                if (_this._conf.jwt)
                    return _this._connectPub();
                return _this;
            }).catch(function (err) {
                console.error('Couldn\'t connect, retrying', err);
            });
            return _this._initPromise;
        };
        this.authenticate = function () {
            return _this._waitInit(function () {
                if (_this._pubSocket) {
                    return true;
                }
                return _this._connectPub();
            });
        };
        this.say = function (message) {
            return _this._waitInit(function () {
                return new Promise(function (resolve, reject) {
                    _this.stats.msgSent++;
                    var start = now();
                    _this._pubSocket.emit('say', { msg: message }, function (response) {
                        _this.stats.latency = now() - start;
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
        this.onEv = function (handler) {
            _this._evHandlers.push(handler);
        };
        this.onUserCountUpdate = function (handler) {
            _this._userCountUpdateHandlers.push(handler);
        };
        this._triggerUserCountUpdate = function () {
            for (var _i = 0, _a = _this._userCountUpdateHandlers; _i < _a.length; _i++) {
                var handler = _a[_i];
                handler(_this.stats);
            }
        };
        this._evUserCountHandler = function (message) {
            if (message.ev === 'join') {
                _this.stats.pubCount++;
            }
            else if (message.ev === 'leave') {
                _this.stats.pubCount--;
            }
            _this._triggerUserCountUpdate();
        };
        this._updateUserCountLoop = function () {
            setTimeout(function () {
                request.get(_this._conf.dispatcherURL + '/stats/' + _this._conf.room)
                    .end(function (err, res) {
                    _this._updateUserCountLoop();
                    if (err) {
                        return;
                    }
                    _this.stats.pubCount = res.body.pubCount;
                    _this.stats.subCount = res.body.subCount;
                    _this._triggerUserCountUpdate();
                });
            }, _this._conf.userCountRefreshTimeout);
        };
        this._handleMessagesBuffer = function (data) {
            var indexes = helpers_1.indexesOf(data, '.');
            console.log(indexes);
            _this._lastReceivedMessageTime = new Date(data.substring(0, indexes[0]));
            var channel = data.substring(indexes[0] + 1, indexes[1]);
            var messages;
            try {
                messages = JSON.parse(data.substring(indexes[1] + 1));
            }
            catch (e) { }
            for (var _i = 0; _i < messages.length; _i++) {
                var message = messages[_i];
                message.channel = channel;
                if (message.msg) {
                    _this.stats.msgReceived++;
                    for (var _a = 0, _b = _this._msgHandlers; _a < _b.length; _a++) {
                        var handler = _b[_a];
                        handler(message);
                    }
                }
                else if (message.ev) {
                    for (var _c = 0, _d = _this._evHandlers; _c < _d.length; _c++) {
                        var handler = _d[_c];
                        handler(message);
                    }
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
                rejectFct(message);
                return false;
            }
            return true;
        };
        this._connectSub = function () {
            return new Promise(function (resolve, reject) {
                if (_this._pushStream) {
                    _this._pushStream.disconnect();
                }
                _this._pushStream = new PushStream.PushStream({
                    host: url.parse(_this._worker.host).hostname,
                    port: _this._conf.nginxPort,
                    pingtimeout: 1000,
                    modes: 'websocket|eventsource|longpolling',
                    useSSL: (window.location.protocol == 'https:'),
                    messagesPublishedAfter: _this._lastReceivedMessageTime,
                    messagesControlByArgument: true
                });
                _this._pushStream.onmessage = _this._handleMessagesBuffer;
                _this._pushStream.addChannel(_this._conf.room);
                if (_this._conf.additionalChannels) {
                    for (var i = 0; i < _this._conf.additionalChannels.length; i++) {
                        _this._pushStream.addChannel(_this._conf.additionalChannels[i]);
                    }
                }
                _this._pushStream.onstatuschange = function (status) {
                    if (status === PushStream.PushStream.OPEN) {
                        return resolve();
                    }
                };
                var retryCount = 0;
                _this._pushStream.onerror = function (err) {
                    console.error(err);
                    retryCount++;
                    if (retryCount <= 2) {
                        _this.status = 'subConnectError';
                        setTimeout(function () {
                            _this._pushStream._lastModified = _this._lastReceivedMessageTime;
                            _this._pushStream.connect();
                        }, 2000);
                    }
                    else {
                        _this.status = 'workerSwitch';
                        _this._error = { type: 'workerSubConnect', worker: _this._worker };
                        _this._pushStream.disconnect();
                        _this._pushStream = null;
                        _this.init();
                    }
                };
                _this._pushStream.connect();
            });
        };
        this._connectPub = function () {
            return new Promise(function (resolve, reject) {
                if (_this._pubSocket) {
                    _this._pubConnected = false;
                    _this._pubSocket.disconnect();
                    _this._pubSocket.destroy();
                    _this._pubSocket = null;
                }
                _this._pubSocket = io(_this._worker.host, _this._conf.socketIO);
                _this._pubSocket.emit('auth', _this._conf.jwt, function (response) {
                    if (!_this._isCorrectReponse(response, reject)) {
                        _this.status = 'authError';
                        return;
                    }
                    _this._pubSocket.emit('join', { room: _this._conf.room }, function (response) {
                        if (!_this._isCorrectReponse(response, reject)) {
                            _this.status = 'authError';
                            return;
                        }
                        _this._pubConnected = true;
                        _this.status = 'authenticated';
                        if (response.comment && response.comment == 'banned') {
                            return resolve({ banned: true, banTTL: response.banTTL });
                        }
                        return resolve();
                    });
                });
                var rejectFct = _.after(2, function (err) {
                    reject(new Error('Couldn\'t connect to websocket pub'));
                });
                _this._pubSocket.on('connect_error', function (err) {
                    _this._pubConnected = false;
                    _this.status = 'pubConnectError';
                    rejectFct(err);
                });
                _this._pubSocket.on('reconnect_failed', function () {
                    _this._pubConnected = false;
                    _this.status = 'workerSwitch';
                    _this._error = { type: 'workerPubConnect', worker: _this._worker };
                    _this._pubSocket.disconnect();
                    _this._pubSocket.destroy();
                    _this.init();
                });
            });
        };
        this._getChatWorker = function () {
            return new Promise(function (resolve, reject) {
                _this.status = 'gettingWorker';
                var dispatcherRequest = request.post(_this._conf.dispatcherURL + '/join/' + _this._conf.room);
                if (_this._error) {
                    dispatcherRequest.send(_this._error);
                }
                dispatcherRequest.end(function (err, res) {
                    if (err) {
                        _this._dispatcherErrorCount++;
                        if (_this._dispatcherErrorCount >= 4) {
                            _this._error = null;
                            _this._dispatcherErrorCount = 0;
                        }
                        if (err.status === 418)
                            _this.status = 'noWorker';
                        else
                            _this.status = 'dispatcherError';
                        return resolve(helpers_1.timeoutPromise(2000).then(_this._getChatWorker));
                    }
                    _this._error = null;
                    _this._dispatcherErrorCount = 0;
                    _this._worker = res.body;
                    _this.stats.pubCount = res.body.channel.pubCount;
                    _this.stats.subCount = res.body.channel.subCount + 1;
                    _this._triggerUserCountUpdate();
                    resolve(res.body);
                });
            });
        };
        this._conf = conf;
        _.defaults(conf, ChatUpProtocol.defaultConf);
        _.defaults(conf.socketIO, ChatUpProtocol.defaultConf.socketIO);
        this._evHandlers.push(this._evUserCountHandler);
    }
    Object.defineProperty(ChatUpProtocol.prototype, "status", {
        get: function () {
            return this._status;
        },
        set: function (status) {
            this._status = status;
            for (var _i = 0, _a = this._statusChangeHandler; _i < _a.length; _i++) {
                var handler = _a[_i];
                handler(status);
            }
        },
        enumerable: true,
        configurable: true
    });
    ChatUpProtocol.defaultConf = {
        dispatcherURL: '/dispatcher',
        room: 'roomDefault',
        socketIO: {
            timeout: 5000,
            reconnectionAttempts: 3,
            forceNew: true
        },
        nginxPort: 80,
        userCountRefreshTimeout: 20000,
        additionalChannels: []
    };
    return ChatUpProtocol;
})();
exports.ChatUpProtocol = ChatUpProtocol;

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
        this.init = function () {
            if (_this._initPromise)
                return _this._initPromise;
            _this._status = 'connecting';
            return _this._initPromise = _this._getChatWorker()
                .then(_this._connectSub)
                .then(function () {
                _this._status = 'connected';
                return _this;
            });
        };
        this.authenticate = function (userInfo) {
            _this._conf.userInfo = userInfo;
            return _this._waitInit(function () {
                return _this._connectPub();
            });
        };
        this.say = function (message) {
            return _this._waitInit(function () {
                return new Promise(function (resolve, reject) {
                    _this._stats.msgSent++;
                    var start = now();
                    _this._pubSocket.emit('say', { msg: message }, function (response) {
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
        this._connectSub = function () {
            return new Promise(function (resolve, reject) {
                _this._pushStream = new PushStream.PushStream({
                    host: url.parse(_this._worker.host).hostname,
                    port: _this._conf.nginxPort,
                    modes: 'websocket|eventsource|longpolling'
                });
                _this._pushStream.onmessage = _this._handleMessagesBuffer;
                _this._pushStream.addChannel(_this._conf.room);
                _this._pushStream.onstatuschange = function (status) {
                    if (status === PushStream.PushStream.OPEN) {
                        return resolve();
                    }
                };
                _this._pushStream.onerror = function (err) {
                    return reject(err);
                };
                _this._pushStream.connect();
            });
        };
        this._connectPub = function () {
            return new Promise(function (resolve, reject) {
                _this._pubSocket = io(_this._worker.host, _this._conf.socketIO);
                _this._pubSocket.on('connect', function () {
                    _this._pubSocket.emit('auth', _this._conf.userInfo, function (response) {
                        if (!_this._isCorrectReponse(response, reject))
                            return;
                        _this._pubSocket.emit('join', { room: _this._conf.room }, function (response) {
                            if (!_this._isCorrectReponse(response, reject))
                                return;
                            _this._status = 'authenticated';
                            return resolve();
                        });
                    });
                });
                var rejectFct = _.after(2, function () {
                    reject(new Error('Couldn\'t connect to websocket pub'));
                });
                _this._pubSocket.on('connect_error', function (err) {
                    rejectFct();
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
                    _this._worker = res.body;
                    resolve(res.body);
                });
            });
        };
        this._conf = conf;
        _.defaults(conf, ChatUpProtocol.defaultConf);
        _.defaults(conf.socketIO, ChatUpProtocol.defaultConf.socketIO);
        this._msgHandlers = [];
        this._stats = {
            msgSent: 0,
            msgReceived: 0,
            latency: Infinity
        };
        this._status = 'disconnected';
    }
    Object.defineProperty(ChatUpProtocol.prototype, "stats", {
        get: function () {
            return this._stats;
        },
        enumerable: true,
        configurable: true
    });
    ChatUpProtocol.defaultConf = {
        dispatcherURL: '/dispatcher',
        userInfo: {},
        room: 'roomDefault',
        socketIO: {
            timeout: 5000
        },
        nginxPort: 42632
    };
    return ChatUpProtocol;
})();
exports.ChatUpProtocol = ChatUpProtocol;
var ChatUp = (function () {
    function ChatUp(el, conf) {
        var _this = this;
        this._initHTML = function () {
            _this._el.innerHTML = ChatUp._template;
            _this._statusTextEl = helpers_1.findClass(_this._el, 'ChatUpStatusText');
            _this._messageForm = helpers_1.findClass(_this._el, 'ChatUpForm');
            _this._messageInput = helpers_1.findClass(_this._el, 'ChatUpInput');
            _this._messagesContainer = helpers_1.findClass(_this._el, 'ChatUpMessages');
            _this._messageForm.onsubmit = _this._formSubmit;
        };
        this._formSubmit = function (e) {
            e.preventDefault();
            if (_this._messageInput.value.length == 0) {
                return;
            }
            _this._protocol.say(_this._messageInput.value).catch(function (err) { console.error(err); });
            _this._messageInput.value = "";
        };
        this._onMsg = function (messageData) {
            var atBottom = _this._messagesContainer.scrollTop === _this._messagesContainer.scrollHeight - _this._messagesContainer.offsetHeight;
            _this._messagesContainer.innerHTML += [
                '<div class="ChatUpMessage">',
                '<p class="ChatUpMessageSender">' + messageData.user.name + '</p>',
                '<p class="ChatUpMessageContent">' + messageData.msg + '</p>',
                '</div>'].join('\n');
            if (atBottom) {
                _this._messagesContainer.scrollTop = Infinity;
            }
        };
        this._el = el;
        this._conf = conf;
        this._protocol = new ChatUpProtocol(this._conf);
        this._initHTML();
    }
    ChatUp.prototype.authenticate = function (userInfo) {
        var _this = this;
        return this._protocol.authenticate(userInfo).then(function () {
            _this._statusTextEl.innerText = 'Connected as ' + userInfo.name + ' to ' + _this._conf.room + ' on server: ' + _this._protocol._worker.host;
        });
    };
    ChatUp.prototype.init = function () {
        var _this = this;
        return this._protocol.init().then(function () {
            _this._statusTextEl.innerText = 'Connected to ' + _this._conf.room + ' on server ' + _this._protocol._worker.host;
            _this._protocol.onMsg(_this._onMsg);
        });
    };
    ChatUp._template = "\n    <div class=\"ChatUpContainer\">\n      <div class=\"ChatUpStatus\">Status: <span class=\"ChatUpStatusText\">Disconnected</span></div>\n      <div class=\"ChatUpMessages\"></div>\n      <div class=\"ChatUpFormContainer\">\n        <form class=\"ChatUpForm\">\n          <input type=\"text\" required=\"true\" class=\"ChatUpInput\">\n          <button class=\"ChatUpFormButton\">Send</button>\n        </form>\n      </div>\n    </div>\n  ";
    return ChatUp;
})();
exports.ChatUp = ChatUp;

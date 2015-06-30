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
            request.get(_this._conf.dispatcherURL + '/stats/' + _this._conf.room)
                .end(function (err, res) {
                if (err) {
                    return;
                }
                _this.stats.pubCount = res.body.pubCount;
                _this.stats.subCount = res.body.subCount;
                _this._triggerUserCountUpdate();
                clearTimeout(_this._userCountRefreshTimeout);
                _this._userCountRefreshTimeout = setTimeout(_this._updateUserCountLoop, _this._conf.userCountRefreshTimeout);
            });
        };
        this._handleMessagesBuffer = function (data) {
            var messages;
            try {
                messages = JSON.parse(data);
            }
            catch (e) { }
            for (var _i = 0; _i < messages.length; _i++) {
                var message = messages[_i];
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
                rejectFct(new Error(message.err));
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
                    useSSL: (window.location.protocol == 'https:')
                });
                _this._pushStream.onmessage = _this._handleMessagesBuffer;
                _this._pushStream.addChannel(_this._conf.room);
                _this._pushStream.onstatuschange = function (status) {
                    if (status === PushStream.PushStream.OPEN) {
                        return resolve();
                    }
                };
                var retryCount = 0;
                _this._pushStream.onerror = function (err) {
                    retryCount++;
                    if (retryCount <= 2) {
                        _this.status = 'subConnectError';
                        setTimeout(function () {
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
                _this._pubSocket = _this._pubSocket || io(_this._worker.host, _this._conf.socketIO);
                _this._pubSocket.emit('auth', _this._conf.jwt, function (response) {
                    if (!_this._isCorrectReponse(response, reject)) {
                        _this.status = 'authError';
                        return;
                    }
                    _this._pubSocket.emit('join', { room: _this._conf.room }, function (response) {
                        if (!_this._isCorrectReponse(response, reject))
                            return;
                        _this.status = 'authenticated';
                        return resolve();
                    });
                });
                var rejectFct = _.after(2, function (err) {
                    reject(new Error('Couldn\'t connect to websocket pub'));
                });
                _this._pubSocket.on('connect_error', function (err) {
                    _this.status = 'pubConnectError';
                    rejectFct(err);
                });
                _this._pubSocket.on('reconnect_failed', function () {
                    _this.status = 'workerSwitch';
                    _this._error = { type: 'workerPubConnect', worker: _this._worker };
                    _this._pubSocket = null;
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
            reconnectionAttempts: 3
        },
        nginxPort: 42632,
        userCountRefreshTimeout: 20000
    };
    return ChatUpProtocol;
})();
exports.ChatUpProtocol = ChatUpProtocol;
var ChatUp = (function () {
    function ChatUp(el, conf) {
        var _this = this;
        this._updateUserCount = function (stats) {
            _this._connectedCountEl.innerText = String(stats.pubCount);
            _this._guestCountEl.innerText = String(stats.subCount - stats.pubCount);
        };
        this._protocolStatusChange = function (status) {
            if (status === 'connected') {
                _this._statusTextEl.innerText = 'Connected to ' + _this._conf.room + ' on server ' + _this._protocol._worker.host;
            }
            else if (status === 'authenticated') {
                _this._statusTextEl.innerText = 'Connected as a publisher to ' + _this._conf.room + ' on server: ' + _this._protocol._worker.host;
            }
            else if (status === 'gettingWorker') {
                _this._statusTextEl.innerText = 'Getting worker from dispatcher';
            }
            else if (status === 'pubConnectError') {
                _this._statusTextEl.innerText = 'Error connecting to worker, retrying...';
            }
            else if (status === 'subConnectError') {
                _this._statusTextEl.innerText = 'Error connecting to sub worker, retrying...';
            }
            else if (status === 'workerSwitch') {
                _this._statusTextEl.innerText = 'Getting another worker';
            }
            else if (status === 'noWorker') {
                _this._statusTextEl.innerText = 'No worker available, retrying...';
            }
            else if (status === 'authError') {
                _this._statusTextEl.innerText = 'Wrong JWT token';
            }
            else if (status === 'dispatcherError') {
                _this._statusTextEl.innerText = 'Error with dispatcher, retrying...';
            }
        };
        this._initHTML = function () {
            _this._el.innerHTML = ChatUp._template;
            _this._statusTextEl = helpers_1.findClass(_this._el, 'ChatUpStatusText');
            _this._guestCountEl = helpers_1.findClass(_this._el, 'ChatUpGuestCount');
            _this._connectedCountEl = helpers_1.findClass(_this._el, 'ChatUpConnectedCount');
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
            if (_this._protocol.status !== 'authenticated') {
                return alert('You need to be authenticated to send a message');
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
        this._onEv = function (messageData) {
            var atBottom = _this._messagesContainer.scrollTop === _this._messagesContainer.scrollHeight - _this._messagesContainer.offsetHeight;
            if (messageData.ev === 'join') {
                _this._messagesContainer.innerHTML += [
                    '<div class="ChatUpMessage">',
                    '<p class="ChatUpMessageSender">' + messageData.user.name + ' joined</p>',
                    '</div>'].join('\n');
            }
            if (messageData.ev === 'leave') {
                _this._messagesContainer.innerHTML += [
                    '<div class="ChatUpMessage">',
                    '<p class="ChatUpMessageSender">' + messageData.user.name + ' left</p>',
                    '</div>'].join('\n');
            }
            if (atBottom) {
                _this._messagesContainer.scrollTop = Infinity;
            }
        };
        this._el = el;
        this._conf = conf;
        this._protocol = new ChatUpProtocol(this._conf);
        this._protocol.onMsg(this._onMsg);
        this._protocol.onEv(this._onEv);
        this._protocol.onStatusChange(this._protocolStatusChange);
        this._protocol.onUserCountUpdate(this._updateUserCount);
        this._initHTML();
    }
    ChatUp.prototype.authenticate = function (jwt) {
        if (this._protocol.status !== 'connected' && this._protocol.status !== 'authError') {
            alert('You need to be connected and not already authenticated to do that');
        }
        else {
            this._conf.jwt = jwt;
            return this._protocol.authenticate();
        }
    };
    ChatUp.prototype.init = function () {
        return this._protocol.init();
    };
    ChatUp._template = "\n    <div class=\"ChatUpContainer\">\n      <div class=\"ChatUpStatus\">Status: <span class=\"ChatUpStatusText\">Disconnected</span></div>\n      <div class=\"ChatUpCount\">Guest: <span class=\"ChatUpGuestCount\">0</span> - Connected Users: <span class=\"ChatUpConnectedCount\">0</span></div>\n      <div class=\"ChatUpMessages\"></div>\n      <div class=\"ChatUpFormContainer\">\n        <form class=\"ChatUpForm\">\n          <input type=\"text\" required=\"true\" class=\"ChatUpInput\">\n          <button class=\"ChatUpFormButton\">Send</button>\n        </form>\n      </div>\n    </div>\n  ";
    return ChatUp;
})();
exports.ChatUp = ChatUp;

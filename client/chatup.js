var ChatUp = (function () {
    function ChatUp(conf) {
        var _this = this;
        this.init = function () {
            return _this._getChatWorker()
                .then(_this._connectSocket)
                .then(_this._authenticate)
                .then(_this._join);
        };
        this._authenticate = function () {
            return new Promise(function (resolve, reject) {
                _this._socket.emit('auth', _this._conf.userInfo, function (message) {
                    if (!_.isObject(message)) {
                        return reject(new Error('Wrong return from the server'));
                    }
                    if (message.status !== 'ok') {
                        return reject(new Error(message.err));
                    }
                    return resolve();
                });
            });
        };
        this._join = function () {
            return new Promise(function (resolve, reject) {
                _this._socket.emit('join', { room: _this._conf.room }, function (message) {
                    if (!_.isObject(message)) {
                        return reject(new Error('Wrong return from the server'));
                    }
                    if (message.status !== 'ok') {
                        return reject(new Error(message.err));
                    }
                    return resolve();
                });
            });
        };
        this._connectSocket = function (workerInfos) {
            return new Promise(function (resolve, reject) {
                _this._socket = io(workerInfos.host + ':' + workerInfos.port);
                _this._socket.on('connect', function () {
                    resolve();
                });
                _this._socket.on('connect_error', function (err) {
                    reject(err);
                });
            });
        };
        this._getChatWorker = function () {
            return reqwest({
                url: _this._conf.dispatcherURL,
                method: 'post'
            });
        };
        this._conf = conf;
    }
    return ChatUp;
})();

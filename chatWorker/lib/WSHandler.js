var socketio = require('socket.io');
var http = require('http');
var redisAdaptater = require('socket.io-redis');
var _ = require('lodash');
var WSHandler = (function () {
    function WSHandler(parent) {
        var _this = this;
        this._onConnection = function (socket) {
            _this._sockets.push(new ChatUpSocket(socket, _this));
        };
        this._parent = parent;
        this._app = http.createServer();
        this._io = socketio(this._app, {
            serverClient: false
        });
        this._redisAdapter = redisAdaptater(this._parent._conf.redis);
        this._io.adapter(this._redisAdapter);
        this._io.on('connection', this._onConnection);
        this._sockets = [];
    }
    WSHandler.prototype.listen = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this._app.listen(_this._parent._conf.port, function (err) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    };
    return WSHandler;
})();
var ChatUpSocket = (function () {
    function ChatUpSocket(socket, parent) {
        var _this = this;
        this._onAuth = function (msg, cb) {
            if (!_.isObject(msg) || !_.isString(msg.name)) {
                return cb({ status: 'error', err: "Wrong format" });
            }
            _this._user = {
                _public: {
                    name: msg.name
                }
            };
            cb({ status: 'ok' });
        };
        this._onJoin = function (msg, cb) {
            if (!_.isObject(msg) || !_.isString(msg.room)) {
                return cb({ status: 'error', err: "Wrong format" });
            }
            if (_this._room) {
                return cb({ status: 'error', err: "Already in a room" });
            }
            _this._room = msg.room;
            _this._socket.join(msg.room);
            cb({ status: 'ok' });
        };
        this._onSay = function (msg, cb) {
            if (!_.isObject(msg) || !_.isString(msg.msg)) {
                return cb({ status: 'error', err: 'Wrong format' });
            }
            if (!_this._room) {
                return cb({ status: 'error', err: 'Never joined a room' });
            }
            _this._socket.to(_this._room).emit('msg', {
                user: _this._user._public,
                msg: msg.msg
            });
            cb({ status: 'ok' });
        };
        console.log('New connection');
        this._socket = socket;
        this._parent = WSHandler;
        this._socket.on('auth', this._onAuth);
        this._socket.on('join', this._onJoin);
        this._socket.on('say', this._onSay);
    }
    return ChatUpSocket;
})();
module.exports = WSHandler;

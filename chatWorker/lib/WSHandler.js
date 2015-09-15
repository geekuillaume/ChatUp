var socketio = require('socket.io');
var http = require('http');
var https = require('https');
var jwt = require('jsonwebtoken');
var redisAdaptater = require('socket.io-redis');
var debugFactory = require('debug');
var _ = require('lodash');
var store_1 = require('./store');
var sticky_1 = require('./sticky');
var logger = require('../../common/logger');
sticky_1.stickyClient(function (conf) {
    var handler = new WSHandler(conf);
    return handler.server;
});
var WSHandler = (function () {
    function WSHandler(conf) {
        var _this = this;
        this._initStatsReporting = function () {
            setInterval(function () {
                process.send({
                    type: 'chatUp:stats',
                    stats: {
                        connections: _this._sockets.length,
                        channels: _this._store.getChannelStats()
                    }
                });
            }, 200);
        };
        this._onConnection = function (socket) {
            _this._debug('Got connection %s from %s', socket.id, socket.client.conn.remoteAddress);
            _this._sockets.push(new ChatUpClient(socket, _this));
        };
        this._debug = debugFactory('ChatUp:ChatWorker:slave:' + process.pid);
        this._debug('Slave init');
        this._conf = conf;
        if (conf.ssl && conf.ssl.key && conf.ssl.cert) {
            this._app = https.createServer(conf.ssl);
        }
        else {
            this._app = http.createServer();
        }
        this._io = socketio(this._app, {
            serverClient: false
        });
        this._store = new store_1.Store(this._conf);
        this._io.on('connection', this._onConnection);
        this._sockets = [];
        this._initStatsReporting();
    }
    Object.defineProperty(WSHandler.prototype, "server", {
        get: function () {
            return this._app;
        },
        enumerable: true,
        configurable: true
    });
    return WSHandler;
})();
exports.WSHandler = WSHandler;
var ChatUpClient = (function () {
    function ChatUpClient(socket, parent) {
        var _this = this;
        this._onAuth = function (msg, cb) {
            if (!_.isString(msg)) {
                logger.captureError(logger.error('Authentication error: Wrong format', msg));
                _this._debug('Authentication error: Wrong format', msg);
                return cb({ status: 'error', err: "Wrong format" });
            }
            jwt.verify(msg, _this._parent._conf.jwt.key, _this._parent._conf.jwt.options, function (err, decoded) {
                if (err) {
                    logger.captureError(logger.error('Authentication error: Wrong format', { err: err, msg: msg }));
                    _this._debug('Authentication error: Wrong JWT', msg, err);
                    return cb({ status: 'error', err: "Wrong JWT" });
                }
                if (!_.isObject(decoded._public)) {
                    logger.captureError(logger.error('Authentication error: Wrong format', { decoded: decoded, msg: msg }));
                    _this._debug('Authentication error: Wrong JWT content', msg, decoded);
                    return cb({ status: 'error', err: "Wrong JWT content" });
                }
                _this._user = decoded;
                _this._debug('Authentified', decoded);
                cb('ok');
            });
        };
        this._onJoin = function (msg, cb) {
            if (!_.isObject(msg) || !_.isString(msg.room)) {
                logger.captureError(logger.error('Wrong format', { msg: msg }));
                return cb({ status: 'error', err: "Wrong format" });
            }
            if (_this._room && _this._room.name === msg.room) {
                return cb('ok');
            }
            if (!_this._user) {
                logger.captureError(logger.error('Not authenticated', { msg: msg }));
                return cb({ status: 'error', err: 'You need to be authenticated to join a room' });
            }
            if (_this._room && _this._room.name !== msg.room) {
                logger.captureError(logger.error('Already in another room', { msg: msg }));
                return cb({ status: 'error', err: "Already in another room" });
            }
            _this._room = _this._parent._store.joinRoom(msg.room, _this);
            _this._debug('Joined room %s', _this._room.name);
            _this._room.verifyBanStatus(_this, function (err, isBanned, banTTL) {
                if (isBanned) {
                    return cb({ status: 'ok', comment: 'banned', banTTL: banTTL });
                }
                cb('ok');
            });
        };
        this._onSay = function (msg, cb) {
            if (!_.isObject(msg) || !_.isString(msg.msg)) {
                logger.captureError(logger.error('Wrong format', { msg: msg }));
                return cb({ status: 'error', err: 'Wrong format' });
            }
            if (!_this._room) {
                logger.captureError(logger.error('No room', { msg: msg }));
                return cb({ status: 'error', err: 'Never joined a room' });
            }
            _this._room.verifyBanStatus(_this, function (err, isBanned, banTTL) {
                if (err) {
                    logger.captureError(logger.error('Internal server error', { err: err }));
                    return cb({ status: 'error', err: 'Internal server error' });
                }
                if (isBanned) {
                    return cb({ status: 'error', err: 'banned', ttl: banTTL });
                }
                _this._room.say({
                    user: _this._user._public,
                    msg: msg.msg
                });
                _this._debug('Saying', msg.msg);
                cb('ok');
            });
        };
        this._onDisconnect = function () {
            _this._debug('Client disconnected');
            if (_this._room) {
                _this._room.quit(_this);
            }
            _.remove(_this._parent._sockets, _this);
        };
        this._debug = debugFactory('ChatUp:ChatWorker:client:' + socket.id);
        this._socket = socket;
        this._parent = parent;
        this._debug('New connection %s from %s', socket.id, socket.client.conn.remoteAddress);
        this._socket.on('auth', this._onAuth);
        this._socket.on('join', this._onJoin);
        this._socket.on('say', this._onSay);
        this._socket.on('disconnect', this._onDisconnect);
    }
    return ChatUpClient;
})();
exports.ChatUpClient = ChatUpClient;

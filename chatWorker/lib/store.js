"use strict";
var redis = require('redis');
var _ = require('lodash');
var superagent = require('superagent');
var Agent = require('agentkeepalive');
var debugFactory = require('debug');
var logger = require('../../common/logger');
var Store = (function () {
    function Store(conf, isMaster) {
        var _this = this;
        if (isMaster === void 0) { isMaster = false; }
        this._treatMessage = function (pattern, channelName, message) {
            var roomName = channelName.slice(4);
            _this._debug('Got from Redis on room %s', roomName);
            var room = _this._rooms[roomName];
            if (!room) {
                room = new Room(roomName, _this);
                _this._rooms[roomName] = room;
            }
            room._pushMessage(message, channelName.slice(2));
        };
        this.joinRoom = function (roomName, client) {
            var room = _this._rooms[roomName];
            if (!room) {
                room = new Room(roomName, _this);
                _this._rooms[roomName] = room;
            }
            room.join(client);
            return room;
        };
        this.getChannelStats = function () {
            return _.map(_this._rooms, function (room) {
                if (!room) {
                    return;
                }
                return {
                    name: room.name,
                    publishers: _.map(room._clients, _.property('_user._public'))
                };
            });
        };
        this._pub = function (roomName, message) {
            _this._debug("Sending on redis in room %s", roomName);
            _this._redisClient.publish("r_" + roomName, JSON.stringify(message));
            var multi = _this._redisClient.multi();
            multi.lpush('chatUp:room:r_' + roomName, JSON.stringify(message));
            multi.ltrim('chatUp:room:r_' + roomName, 0, _this._conf.messageHistory.size - 1);
            multi.expire('chatUp:room:r_' + roomName, _this._conf.messageHistory.expire);
            multi.exec(function (err, op) {
                if (err) {
                    console.error('Error while saving message to redis', err);
                    logger.captureError(logger.error('Redis sending error', { err: err }));
                }
            });
        };
        this._isMaster = isMaster;
        this._debug = debugFactory('ChatUp:Store:' + process.pid);
        this._debug('Store created');
        this._conf = conf;
        this._rooms = {};
        if (isMaster) {
            this._subClient = redis.createClient(this._conf.redis.port, this._conf.redis.host);
            this._subClient.psubscribe('r_*');
            this._agent = new Agent({});
            this._subClient.on('pmessage', this._treatMessage);
        }
        else {
            this._redisClient = redis.createClient(this._conf.redis.port, this._conf.redis.host);
        }
    }
    return Store;
})();
exports.Store = Store;
var Room = (function () {
    function Room(name, parent) {
        var _this = this;
        this._messageBuffer = [];
        this._handlers = [];
        this._clients = [];
        this.say = function (message) {
            _this._debug('Saying:', message);
            _this._parent._pub(_this._msgChannelName, message);
        };
        this._drain = function () {
            _.chain(_this._messageBuffer).groupBy('channelName').map(function (messages, channelName) {
                _this._debug('Draining %s messages', _this._messageBuffer.length);
                superagent.post('http://' + _this._parent._conf.nginx.host + ':' + _this._parent._conf.nginx.port + '/pub')
                    .agent(_this._parent._agent)
                    .query({ id: channelName })
                    .send(_.map(messages, 'message'))
                    .end(function (err, data) {
                    if (err) {
                        logger.captureError(logger.error('Sending messages to Redis', { err: err }));
                    }
                    _this._debug('Sent %s messages to nginx on channel %s', messages.length, channelName);
                });
            }).value();
            _this._messageBuffer = [];
        };
        this.onMsg = function (handler) {
            _this._handlers.push(handler);
        };
        this._pushMessage = function (rawMessage, channelName) {
            var message;
            try {
                message = JSON.parse(rawMessage);
            }
            catch (e) {
                logger.captureError(logger.error('Message in Redis is not JSON', { rawMessage: rawMessage }));
                return _this._debug('Message in Redis is not JSON', rawMessage);
            }
            if (!_.isObject(message)) {
                logger.captureError(logger.error('Incorrect message in Redis', { message: message }));
                return _this._debug('Incorrect message in Redis', message);
            }
            _this._messageBuffer.push({ channelName: channelName, message: message });
            _this._debug('Received and added to buffer: %s', message.msg);
        };
        this.join = function (client) {
            _this._debug('Join');
            _this._joined++;
            _this._clients.push(client);
            _this._parent._pub(_this._eventChannelName, {
                user: client._user._public,
                ev: 'join'
            });
        };
        this.quit = function (client) {
            _this._debug('Quit');
            _this._joined--;
            _.remove(_this._clients, client);
            _this._parent._pub(_this._eventChannelName, {
                user: client._user._public,
                ev: 'leave'
            });
            if (_this._joined <= 0) {
                _this._parent._rooms[_this.name] = null;
            }
        };
        this.verifyBanStatus = function (user) {
            return new Promise(function (resolve, reject) {
                var keyName = 'chatUp:ban:' + _this.name + ':' + user.name;
                _this._parent._redisClient.ttl(keyName, function (err, banTTL) {
                    if (err) {
                        return reject(err);
                    }
                    resolve({
                        isBanned: banTTL !== -2,
                        banTTL: banTTL
                    });
                });
            });
        };
        this._debug = debugFactory('ChatUp:Store:Room:' + name + ':' + process.pid);
        this._debug('Created room');
        this._parent = parent;
        this.name = name;
        this._eventChannelName = 'e_' + this.name;
        this._msgChannelName = 'm_' + this.name;
        this._joined = 0;
        if (parent._isMaster) {
            setInterval(this._drain, this._parent._conf.msgBufferDelay);
        }
    }
    return Room;
})();
exports.Room = Room;

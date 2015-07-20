var redis = require('redis');
var _ = require('lodash');
var superagent = require('superagent');
var Agent = require('agentkeepalive');
var debugFactory = require('debug');
var Store = (function () {
    function Store(conf, isMaster) {
        var _this = this;
        if (isMaster === void 0) { isMaster = false; }
        this._treatMessage = function (pattern, channelName, message) {
            var roomName = channelName.slice(2);
            _this._debug('Got from Redis on room %s', roomName);
            var room = _this._rooms[roomName];
            if (!room) {
                room = new Room(roomName, _this);
                _this._rooms[roomName] = room;
            }
            room._pushMessage(message);
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
            _this._parent._pub(_this.name, message);
        };
        this._drain = function () {
            if (_this._messageBuffer.length) {
                _this._debug('Draining %s messages', _this._messageBuffer.length);
                var messageBufferLength = _this._messageBuffer.length;
                superagent.post('http://' + _this._parent._conf.nginx.host + ':' + _this._parent._conf.nginx.port + '/pub')
                    .agent(_this._parent._agent)
                    .query({ id: _this.name })
                    .send(_this._messageBuffer)
                    .end(function (err, data) {
                    _this._debug('Sent %s messages to nginx', messageBufferLength);
                });
                _this._messageBuffer = [];
            }
        };
        this.onMsg = function (handler) {
            _this._handlers.push(handler);
        };
        this._pushMessage = function (rawMessage) {
            var message;
            try {
                message = JSON.parse(rawMessage);
            }
            catch (e) {
                return _this._debug('Message in Redis is not JSON', rawMessage);
            }
            if (!_.isObject(message) || !_.isObject(message.user)) {
                return _this._debug('Incorrect message in Redis', message);
            }
            _this._messageBuffer.push(message);
            _this._debug('Received and added to buffer: %s', message.msg);
        };
        this.join = function (client) {
            _this._debug('Join');
            _this._joined++;
            _this._clients.push(client);
            _this._parent._pub(_this.name, {
                user: client._user._public,
                ev: 'join'
            });
        };
        this.quit = function (client) {
            _this._debug('Quit');
            _this._joined--;
            _.remove(_this._clients, client);
            _this._parent._pub(_this.name, {
                user: client._user._public,
                ev: 'leave'
            });
            if (_this._joined <= 0) {
                _this._parent._rooms[_this.name] = null;
            }
        };
        this.verifyBanStatus = function (client, callback) {
            var keyName = 'chatUp:ban:' + _this.name + ':' + client._user._public.name;
            _this._parent._redisClient.ttl(keyName, function (err, banTTL) {
                return callback(err, banTTL !== -2, banTTL);
            });
        };
        this._debug = debugFactory('ChatUp:Store:Room:' + name + ':' + process.pid);
        this._debug('Created room');
        this._parent = parent;
        this.name = name;
        this._joined = 0;
        if (parent._isMaster) {
            setInterval(this._drain, this._parent._conf.msgBufferDelay);
        }
    }
    return Room;
})();
exports.Room = Room;

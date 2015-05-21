var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var events_1 = require('events');
var redis = require('redis');
var _ = require('lodash');
var debugFactory = require('debug');
var Store = (function () {
    function Store(parent) {
        var _this = this;
        this.joinRoom = function (roomName) {
            var room = _this._rooms[roomName];
            if (!room) {
                room = new Room(roomName, _this);
                _this._rooms[roomName] = room;
            }
            room.join();
            return room;
        };
        this._sub = function (roomName) {
            _this._subClient.subscribe(roomName);
        };
        this._unsub = function (roomName) {
            _this._subClient.unsubscribe(roomName);
        };
        this._pub = function (roomName, message) {
            _this._pubClient.publish(roomName, JSON.stringify(message));
        };
        this._debug = debugFactory('ChatUp:Store:' + process.pid);
        this._debug('Store created');
        this._parent = parent;
        this._pubClient = redis.createClient(this._parent._conf.redis.port, this._parent._conf.redis.host);
        this._subClient = redis.createClient(this._parent._conf.redis.port, this._parent._conf.redis.host);
        this._rooms = {};
        this._subClient.on('message', function (roomName, message) {
            var room = _this._rooms[roomName];
            if (!room) {
                return _this._debug('Got from an unknown room, subscription not cleared');
            }
            _this._debug('Got from Redis on room %s', roomName);
            room._pushMessage(message);
        });
    }
    return Store;
})();
exports.Store = Store;
var Room = (function (_super) {
    __extends(Room, _super);
    function Room(name, parent) {
        var _this = this;
        _super.call(this);
        this.say = function (message) {
            _this._debug('Saying:', message);
            _this._parent._pub(_this.name, message);
        };
        this._drain = function () {
            if (_this._messageBuffer.length) {
                _this._debug('Draining %s messages', _this._messageBuffer.length);
                _.each(_this._handlers, function (handler) {
                    handler(_this._messageBuffer);
                });
                _this.emit('msg', _this._messageBuffer);
                _this._messageBuffer = [];
            }
        };
        this.onMsg = function (handler) {
            _this._debug('adding:', handler);
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
            if (!_.isObject(message) || !_.isString(message.msg) || !_.isObject(message.user)) {
                return _this._debug('Incorrect message in Redis', message);
            }
            _this._messageBuffer.push(message);
            _this._debug('Received and added to buffer: %s', message.msg);
        };
        this.join = function () {
            _this._debug('Join');
            _this._joined++;
            if (_this._joined === 1) {
                _this._parent._sub(_this.name);
            }
        };
        this.quit = function () {
            _this._debug('Quit');
            _this._joined--;
            if (_this._joined <= 0) {
                _this._destroy();
            }
        };
        this._destroy = function () {
            _this._debug('Destroy');
            _this._parent._unsub(_this.name);
            _this._messageBuffer = [];
        };
        this._debug = debugFactory('ChatUp:Store:Room:' + name + ':' + process.pid);
        this._debug('Created room');
        this._parent = parent;
        this.name = name;
        this._joined = 0;
        this._messageBuffer = [];
        this._handlers = [];
        setInterval(this._drain, this._parent._parent._conf.msgBufferDelay);
    }
    return Room;
})(events_1.EventEmitter);
exports.Room = Room;

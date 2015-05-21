import {EventEmitter} from 'events';
import redis = require('redis');
import _ = require('lodash');
import {ChatMessage} from '../index';
import {WSHandler} from './WSHandler';
var debugFactory = require('debug');

export class Store {

  _parent: WSHandler;
  _rooms: {[index: string]: Room};
  _debug: Function;

  _pubClient: redis.RedisClient;
  _subClient: redis.RedisClient;

  constructor(parent: WSHandler) {
    this._debug = debugFactory('ChatUp:Store:' + process.pid);
    this._debug('Store created');
    this._parent = parent;
    this._pubClient = redis.createClient(this._parent._conf.redis.port, this._parent._conf.redis.host);
    this._subClient = redis.createClient(this._parent._conf.redis.port, this._parent._conf.redis.host);
    this._rooms = {};

    this._subClient.on('message', (roomName, message) => {
      var room = this._rooms[roomName];
      if (!room) {
        return this._debug('Got from an unknown room, subscription not cleared')
      }
      this._debug('Got from Redis on room %s', roomName);
      room._pushMessage(message);
    });

  }

  joinRoom = (roomName: string): Room => {
    var room = this._rooms[roomName];
    if (!room) {
      room = new Room(roomName, this);
      this._rooms[roomName] = room;
    }
    room.join();
    return room;
  }

  _sub = (roomName) => {
    this._subClient.subscribe(roomName);
  }
  _unsub = (roomName) => {
    this._subClient.unsubscribe(roomName);
  }

  _pub = (roomName, message) => {
    this._pubClient.publish(roomName, JSON.stringify(message));
  }

}

export class Room extends EventEmitter {
  name: string;
  _parent: Store;
  _joined: number;
  _messageBuffer: ChatMessage[];
  _debug: Function;
  _handlers: Function[];

  constructor(name: string, parent: Store) {
    super();
    this._debug = debugFactory('ChatUp:Store:Room:' + name + ':' + process.pid);
    this._debug('Created room');
    this._parent = parent;
    this.name = name;
    this._joined = 0;
    this._messageBuffer = [];
    this._handlers = [];
    setInterval(this._drain, this._parent._parent._conf.msgBufferDelay);
  }

  say = (message: ChatMessage) => {
    this._debug('Saying:', message);
    this._parent._pub(this.name, message);
  }

  _drain = () => {
    if (this._messageBuffer.length) {
      this._debug('Draining %s messages', this._messageBuffer.length);
      _.each(this._handlers, (handler) => {
        handler(this._messageBuffer);
      });
      this.emit('msg', this._messageBuffer);
      this._messageBuffer = [];
    }
  }

  onMsg = (handler: Function) => {
    this._debug('adding:', handler);
    this._handlers.push(handler);
  }

  _pushMessage = (rawMessage: string) => {
    var message: ChatMessage;
    try {
      message = JSON.parse(rawMessage);
    } catch (e) {
      return this._debug('Message in Redis is not JSON', rawMessage);
    }
    if (!_.isObject(message) || !_.isString(message.msg) || !_.isObject(message.user)) {
      return this._debug('Incorrect message in Redis', message);
    }
    this._messageBuffer.push(message);
    this._debug('Received and added to buffer: %s', message.msg);
  }

  join = () => {
    this._debug('Join');
    this._joined++;
    if (this._joined === 1) {
      this._parent._sub(this.name);
    }
  }
  quit = () => {
    this._debug('Quit');
    this._joined--;
    if (this._joined <= 0) {
      this._destroy();
    }
  }
  _destroy = () => {
    this._debug('Destroy');
    this._parent._unsub(this.name);
    this._messageBuffer = [];
  }
}

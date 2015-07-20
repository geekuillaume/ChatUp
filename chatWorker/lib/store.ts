import {EventEmitter} from 'events';
import redis = require('redis');
import _ = require('lodash');
import {ChatMessage} from '../index';
import {WSHandler} from './WSHandler';
import superagent = require('superagent');
import {ChatWorkerConf} from '../index';
import {ChatUpClient} from './WSHandler';
var Agent = require('agentkeepalive');
var debugFactory = require('debug');

export class Store {

  _conf: ChatWorkerConf;
  _rooms: {[index: string]: Room};
  _debug: Function;

  _redisClient: redis.RedisClient;
  _subClient: redis.RedisClient;

  _agent: any;

  _isMaster: Boolean;

  constructor(conf: ChatWorkerConf, isMaster = false) {
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
    } else {
      this._redisClient = redis.createClient(this._conf.redis.port, this._conf.redis.host);
    }
  }

  _treatMessage = (pattern, channelName, message) => {
    var roomName = channelName.slice(2);
    this._debug('Got from Redis on room %s', roomName);
    var room = this._rooms[roomName];
    if (!room) {
      room = new Room(roomName, this);
      this._rooms[roomName] = room;
    }
    room._pushMessage(message);
  }

  joinRoom = (roomName: string, client: ChatUpClient): Room => {
    var room = this._rooms[roomName];
    if (!room) {
      room = new Room(roomName, this);
      this._rooms[roomName] = room;
    }
    room.join(client);
    return room;
  }

  getChannelStats = (): [{channel: string, publishers: number}] => {
    return <any>_.map(this._rooms, (room) => {
      if (!room) {return}
      return {
        name: room.name,
        publishers: _.map(room._clients, _.property('_user._public'))
      }
    });
  }

  _pub = (roomName, message) => {
    this._debug("Sending on redis in room %s", roomName);
    this._redisClient.publish("r_" + roomName, JSON.stringify(message));
  }

}

export class Room {
  name: string;
  _parent: Store;
  _joined: number;
  _messageBuffer: ChatMessage[] = [];
  _debug: Function;
  _handlers: Function[] = [];
  _clients: ChatUpClient[] = [];

  constructor(name: string, parent: Store) {
    this._debug = debugFactory('ChatUp:Store:Room:' + name + ':' + process.pid);
    this._debug('Created room');
    this._parent = parent;
    this.name = name;
    this._joined = 0;
    if (parent._isMaster) {
      setInterval(this._drain, this._parent._conf.msgBufferDelay);
    }
  }

  say = (message: ChatMessage) => {
    this._debug('Saying:', message);
    this._parent._pub(this.name, message);
  }

  _drain = () => {
    if (this._messageBuffer.length) {
      this._debug('Draining %s messages', this._messageBuffer.length);
      // _.each(this._handlers, (handler) => {
      //   handler(this._messageBuffer);
      // });
      // this.emit('msg', this._messageBuffer);
      var messageBufferLength = this._messageBuffer.length;
      superagent.post('http://'+ this._parent._conf.nginx.host +':'+ this._parent._conf.nginx.port +'/pub')
        .agent(this._parent._agent)
        .query({id: this.name})
        .send(this._messageBuffer)
        .end((err, data) => {
          this._debug('Sent %s messages to nginx', messageBufferLength);
        });
      this._messageBuffer = [];
    }
  }

  onMsg = (handler: Function) => {
    this._handlers.push(handler);
  }

  _pushMessage = (rawMessage: string) => {
    var message: ChatMessage;
    try {
      message = JSON.parse(rawMessage);
    } catch (e) {
      return this._debug('Message in Redis is not JSON', rawMessage);
    }
    if (!_.isObject(message) || !_.isObject(message.user)) {
      return this._debug('Incorrect message in Redis', message);
    }
    this._messageBuffer.push(message);
    this._debug('Received and added to buffer: %s', message.msg);
  }

  join = (client: ChatUpClient) => {
    this._debug('Join');
    this._joined++;
    this._clients.push(client);
    this._parent._pub(this.name, {
      user: client._user._public,
      ev: 'join'
    });
  }
  quit = (client: ChatUpClient) => {
    this._debug('Quit');
    this._joined--;
    _.remove(this._clients, <any>client);
    this._parent._pub(this.name, {
      user: client._user._public,
      ev: 'leave'
    });
    if (this._joined <= 0) {
      this._parent._rooms[this.name] = null;
    }
  }

  verifyBanStatus = (client: ChatUpClient, callback: (err:Object, isBanned: boolean, ttl: number) => any) => {
    var keyName = 'chatUp:ban:' + this.name + ':' + client._user._public.name;
    this._parent._redisClient.ttl(keyName, (err, banTTL) => {
      return callback(err, banTTL !== -2, banTTL);
    })
  }
}

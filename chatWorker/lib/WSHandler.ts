import socketio = require('socket.io');
import http = require('http');
import jwt = require('jsonwebtoken');
var redisAdaptater = require('socket.io-redis');
var debugFactory = require('debug');
import _ = require('lodash');
import {ChatWorker, ChatWorkerConf} from '../index';
import {Store, Room} from './store';
import {stickyClient} from './sticky';

stickyClient(function(conf) {
  var handler = new WSHandler(conf);
  return handler.server;
})

export class WSHandler {
  _io: SocketIO.Server;
  _conf:ChatWorkerConf;
  _app: http.Server;
  _sockets: ChatUpSocket[];
  _debug: Function;
  _store: Store;

  constructor(conf: ChatWorkerConf) {
    this._debug = debugFactory('ChatUp:ChatWorker:slave:' + process.pid);
    this._debug('Slave init');
    this._conf = conf;
    this._app = http.createServer();
    this._io = socketio(this._app, {
      serverClient: false
    });
    this._store = new Store(this._conf);
    this._io.on('connection', this._onConnection);
    this._sockets = [];
    this._initStatsReporting();
  }

  _initStatsReporting = () => {
    setInterval(() => {
      process.send({
        type: 'chatUp:stats',
        stats: {
          connections: this._sockets.length
        }
      });
    }, 200);
  }

  _onConnection = (socket: SocketIO.Socket) => {
    this._debug('Got connection %s from %s', socket.id, socket.client.conn.remoteAddress);
    this._sockets.push(new ChatUpSocket(socket, this));
  }

  get server() {
    return this._app;
  }
}

export interface WSUser {
  _public: {};
}

class ChatUpSocket {
  _socket: SocketIO.Socket;
  _parent: WSHandler;
  _room: Room;
  _user: WSUser;
  _debug: Function;

  constructor(socket: SocketIO.Socket, parent: WSHandler) {
    this._debug = debugFactory('ChatUp:ChatWorker:client:' + socket.id);
    this._socket = socket;
    this._parent = parent;

    this._debug('New connection %s from %s', socket.id, socket.client.conn.remoteAddress);
    this._socket.on('auth', this._onAuth);
    this._socket.on('join', this._onJoin);
    this._socket.on('say', this._onSay);
    this._socket.on('disconnect', this._onDisconnect);
  }

  _onAuth = (msg, cb) => {
    if (!_.isString(msg)) {
      this._debug('Authentication error: Wrong format', msg);
      return cb({status: 'error', err: "Wrong format"});
    }
    console.log("Key:", this._parent._conf.jwt.key);
    jwt.verify(
      msg,
      this._parent._conf.jwt.key,
      this._parent._conf.jwt.options,
      (err, decoded) => {
        if (err) {
          this._debug('Authentication error: Wrong JWT', msg, err);
          return cb({status: 'error', err: "Wrong JWT"});
        }
        this._user = decoded;
        this._debug('Authentified');
        cb('ok');
    });
  }

  _onJoin = (msg, cb) => {
    if (!_.isObject(msg) || !_.isString(msg.room)) {
      return cb({status: 'error', err: "Wrong format"});
    }
    if (this._room) {
      return cb({status: 'error', err: "Already in a room"});
    }
    this._room = this._parent._store.joinRoom(msg.room);
    this._debug('Joined room %s', this._room.name);
    cb('ok');
  }

  _onSay = (msg, cb) => {
    if (!_.isObject(msg) || !_.isString(msg.msg)) {
      return cb({status: 'error', err: 'Wrong format'});
    }
    if (!this._room) {
      return cb({status: 'error', err: 'Never joined a room'});
    }
    this._room.say({
      user: this._user._public,
      msg: msg.msg
    });
    this._debug('Saying', msg.msg);
    cb('ok');
  }

  _onDisconnect = () => {
    this._debug('Client disconnected');
    if (this._room) {
      this._room.quit();
    }
    _.remove(this._parent._sockets, this);
  }

}

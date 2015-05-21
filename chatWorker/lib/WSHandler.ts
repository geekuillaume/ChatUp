import socketio = require('socket.io');
import http = require('http');
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
    this._store = new Store(this);
    this._io.on('connection', this._onConnection);
    this._sockets = [];
  }

  _onConnection = (socket: SocketIO.Socket) => {
    this._debug('Got connection %s from %s', socket.id, socket.client.conn.remoteAddress);
    this._sockets.push(new ChatUpSocket(socket, this));
  }

  get server() {
    return this._app;
  }
}

interface WSUser {
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
    if (!_.isObject(msg) || !_.isString(msg.name)) {
      return cb({status: 'error', err: "Wrong format"});
    }
    this._user = {
      _public: {
        name: msg.name
      }
    };
    this._debug('Authentified', this._socket.id);
    cb('ok');
  }

  _onJoin = (msg, cb) => {
    if (!_.isObject(msg) || !_.isString(msg.room)) {
      return cb({status: 'error', err: "Wrong format"});
    }
    if (this._room) {
      return cb({status: 'error', err: "Already in a room"});
    }
    this._room = this._parent._store.joinRoom(msg.room);
    this._room.onMsg(this._onMsg);
    this._debug('Joined room %s', this._room.name);
    cb('ok');
  }

  _onMsg = (messages) => {
    this._debug('Sending %s messages', messages.length);
    this._socket.emit('msg', messages);
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
    this._debug('Client %s disconnected', this._socket.id);
    if (this._room) {
      this._room.quit();
    }
  }

}

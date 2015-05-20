import socketio = require('socket.io');
import http = require('http');
var redisAdaptater = require('socket.io-redis');
var debugFactory = require('debug');
import _ = require('lodash');
import ChatWorker = require('../index');

class WSHandler {
  _parent: ChatWorker.ChatWorker;
  _io: SocketIO.Server;
  _app: http.Server;
  _redisAdapter;
  _sockets: ChatUpSocket[];
  _debug: Function;

  constructor(parent: ChatWorker.ChatWorker) {
    this._debug = debugFactory('ChatUp:ChatWorker:slave:' + process.pid);
    this._debug('Slave init');
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
  _parent: typeof WSHandler;
  _room: string;
  _user: WSUser;
  _debug: Function;

  constructor(socket: SocketIO.Socket, parent: WSHandler) {
    this._debug = debugFactory('ChatUp:ChatWorker:client:' + socket.id);
    this._socket = socket;
    this._parent = WSHandler;

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
    cb({status: 'ok'});
  }

  _onJoin = (msg, cb) => {
    if (!_.isObject(msg) || !_.isString(msg.room)) {
      return cb({status: 'error', err: "Wrong format"});
    }
    if (this._room) {
      return cb({status: 'error', err: "Already in a room"});
    }
    this._room = msg.room;
    this._socket.join(msg.room);
    this._debug('Joined room %s', this._socket.id, this._room);
    cb({status: 'ok'});
  }

  _onSay = (msg, cb) => {
    if (!_.isObject(msg) || !_.isString(msg.msg)) {
      return cb({status: 'error', err: 'Wrong format'});
    }
    if (!this._room) {
      return cb({status: 'error', err: 'Never joined a room'});
    }
    this._socket.to(this._room).emit('msg', {
      user: this._user._public,
      msg: msg.msg
    });
    this._debug('Say %s', msg.msg);
    cb({status: 'ok'});
  }

  _onDisconnect = () => {
    this._debug('Client %s disconnected', this._socket.id);
  }

}

export = WSHandler;

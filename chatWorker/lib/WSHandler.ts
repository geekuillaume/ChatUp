import socketio = require('socket.io');
import http = require('http');
import https = require('https');
import jwt = require('jsonwebtoken');
var redisAdaptater = require('socket.io-redis');
var debugFactory = require('debug');
import _ = require('lodash');
import {ChatWorker, ChatWorkerConf} from '../index';
import {Store, Room} from './store';
import {stickyClient} from './sticky';
import logger = require('../../common/logger');
import {runMiddlewares} from './middleware';

export function startWSHandler(conf) {
  var handler = new WSHandler(conf);
  stickyClient(handler.server);
  return handler;
}

export class WSHandler {
  _io: SocketIO.Server;
  _conf:ChatWorkerConf;
  _app: any;
  _sockets: ChatUpClient[];
  _debug: Function;
  _store: Store;

  constructor(conf: ChatWorkerConf) {
    this._debug = debugFactory('ChatUp:ChatWorker:slave:' + process.pid);
    this._debug('Slave init');
    this._conf = conf;
    if (conf.ssl && conf.ssl.key && conf.ssl.cert) {
      this._app = https.createServer(conf.ssl);
    } else {
      this._app = http.createServer();
    }
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
          connections: this._sockets.length,
          channels: this._store.getChannelStats()
        }
      });
    }, 200);
  }

  _onConnection = (socket: SocketIO.Socket) => {
    this._debug('Got connection %s from %s', socket.id, socket.client.conn.remoteAddress);
    this._sockets.push(new ChatUpClient(socket, this));
  }

  get server() {
    return this._app;
  }
}

export interface WSUser {
  _public: any;
}

export class ChatUpClient {
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
      logger.captureError(logger.error('Authentication error: Wrong format', msg))
      this._debug('Authentication error: Wrong format', msg);
      return cb({status: 'error', err: "Wrong format"});
    }
    jwt.verify(
      msg,
      this._parent._conf.jwt.key,
      this._parent._conf.jwt.options,
      (err, decoded) => {
        if (err) {
          logger.captureError(logger.error('Authentication error: Wrong format', {err, msg}))
          this._debug('Authentication error: Wrong JWT', msg, err);
          return cb({status: 'error', err: "Wrong JWT"});
        }
        if (!_.isObject(decoded._public)) {
          logger.captureError(logger.error('Authentication error: Wrong format', {decoded, msg}))
          this._debug('Authentication error: Wrong JWT content', msg, decoded);
          return cb({status: 'error', err: "Wrong JWT content"});
        }
        this._user = decoded;
        this._debug('Authentified', decoded);
        cb('ok');
    });
  }

  _onJoin = (msg, cb) => {
    if (!_.isObject(msg) || !_.isString(msg.room)) {
      logger.captureError(logger.error('Wrong format', {msg}))
      return cb({status: 'error', err: "Wrong format"});
    }
    if (this._room && this._room.name === msg.room) {
      return cb('ok');
    }
    if (!this._user) {
      logger.captureError(logger.error('Not authenticated', {msg}))
      return cb({status: 'error', err: 'You need to be authenticated to join a room'})
    }
    if (this._room && this._room.name !== msg.room) {
      logger.captureError(logger.error('Already in another room', {msg}))
      return cb({status: 'error', err: "Already in another room"});
    }
    this._room = this._parent._store.joinRoom(msg.room, this);
    this._debug('Joined room %s', this._room.name);
    this._room.verifyBanStatus(this._user).then((info) => {
      if (info.isBanned) {
        return cb({status: 'ok', comment: 'banned', banTTL: info.banTTL});
      }
      cb('ok');
    }).catch((err) => {
      logger.captureError(err);
      cb({status: 'err', err: err});
    });
  }

  _onSay = (msg, cb) => {
    try {
      if (!_.isObject(msg) || !_.isString(msg.msg)) {
        logger.captureError(logger.error('Wrong format', {msg}))
        return cb({status: 'error', err: 'Wrong format'});
      }
      if (!this._room) {
        logger.captureError(logger.error('No room', {msg}))
        return cb({status: 'error', err: 'Never joined a room'});
      }
      runMiddlewares(this._parent._conf.middlewares, {
        user: this._user,
        redisConnection: this._room._parent._redisClient,
        msg: msg,
        room: this._room
      }).then(() => {
        this._room.say({
          user: this._user._public,
          msg: msg.msg
        });
        this._debug('Saying', msg.msg);
        cb('ok');
      }).catch((err) => {
        logger.captureError(err);
        return cb(err);
      });
    } catch(err) {
      logger.captureError(err);
      return cb({status: 'error', err});
    }
  }

  _onDisconnect = () => {
    this._debug('Client disconnected');
    if (this._room) {
      this._room.quit(this);
    }
    _.remove(this._parent._sockets, <any>this);
  }

}

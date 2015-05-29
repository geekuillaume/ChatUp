var request = require('superagent');
var io = require('socket.io-client');
import _ = require('lodash');
var es6shim = require('es6-shim');
var now = require('performance-now');
var PushStream = require('./nginx-pushstream.js');
import url = require('url');

interface ChatUpConf {
  dispatcherURL: string;
  userInfo: {};
  room: string;
  socketIO: {};
  nginxPort: number;
}

interface ChatUpStats {
  msgSent: number;
  msgReceived: number;
  latency: number;
}

class ChatUp {

  static defaultConf: ChatUpConf = {
    dispatcherURL: '/dispatcher',
    userInfo: {},
    room: 'defaultRoom',
    socketIO: {
      timeout: 5000
    },
    nginxPort: 42632
  }

  _conf: ChatUpConf;
  _socket: any;
  _pushStream: any;
  _msgHandlers: Function[];

  _initPromise: Promise<any>;

  _stats: ChatUpStats;

  constructor(conf: ChatUpConf) {
    this._conf = conf;
    _.defaults(conf, ChatUp.defaultConf);
    _.defaults(conf.socketIO, ChatUp.defaultConf.socketIO);
    this._msgHandlers = [];
    this._stats = {
      msgSent: 0,
      msgReceived: 0,
      latency:Infinity
    };
  }

  get stats() {
    return this._stats;
  }

  init = ():Promise<any> => {
    if (this._initPromise)
      return this._initPromise;

    var promise = this._initPromise = this._getChatWorker().then(this._connectSocket);

    if (this._conf.userInfo) { // Only authenticate if got userInfos
      promise = promise.then(this._authenticate);
    }

    return promise.then(this._join)
      .then(() => {
        return this;
      });
  }

  say = (message):Promise<any> => {
    return this._waitInit(() => {
      return new Promise<any>((resolve, reject) => {
        this._stats.msgSent++;
        var start = now();
        this._socket.emit('say', {msg: message}, (response) => {
          this._stats.latency = now() - start;
          if (!this._isCorrectReponse(response, reject))
            return;
          return resolve();
        });
      })
    });
  }

  onMsg = (handler) => {
    this._msgHandlers.push(handler)
  }

  _handleMessagesBuffer = (data) => {
    var messages;
    try {
      messages = JSON.parse(data);
    } catch (e) {}
    for (let message of messages) {
      this._stats.msgReceived++;
      for(let handler of this._msgHandlers) {
        handler(message);
      }
    }
  }

  _waitInit = (fct: Function):Promise<any> => {
    return this._initPromise.then(() => {
      return fct();
    });
  }

  _isCorrectReponse = (message, rejectFct):boolean => {
    if (message === 'ok') {
      return true;
    }
    if (!_.isObject(message)) {
      rejectFct(new Error('Wrong return from the server: ' + message));
      return false;
    }
    if (message.status !== 'ok') {
      rejectFct(new Error(message.err));
      return false;
    }
    return true;
  }

  _authenticate = ():Promise<any> => {
    return new Promise((resolve, reject) => {
      this._socket.emit('auth', this._conf.userInfo, (response) => {
        if (!this._isCorrectReponse(response, reject))
          return;
        return resolve();
      });
    });
  }

  _join = ():Promise<any> => {
    return new Promise((resolve, reject) => {
      this._socket.emit('join', {room: this._conf.room}, (response) => {
        if (!this._isCorrectReponse(response, reject))
          return;
        return resolve();
      });
    });
  }

  _connectSocket = (worker):Promise<any> => {
    this._pushStream = new PushStream.PushStream({
      host: url.parse(worker.host).hostname,
      port: this._conf.nginxPort,
      modes: 'websocket|eventsource|longpolling'
    });
    this._pushStream.onmessage = this._handleMessagesBuffer;
    this._pushStream.addChannel(this._conf.room);
    this._pushStream.connect();
    return new Promise((resolve, reject) => {
      this._socket = io(worker.host, this._conf.socketIO);
      this._socket.on('connect', () => {
        resolve();
      });
      this._socket.on('connect_error', (err) => {
        console.error('Couldn\'t connect to socket, retrying', err);
        _.after(2, function() {
          reject(err);
        });
      });
    });
  }

  _getChatWorker = ():Promise<any> => {
    return new Promise((resolve, reject) => {
      request.post(this._conf.dispatcherURL)
      .end((err, res) => {
        if (err) {
          return reject(err);
        }
        resolve(res.body);
      });
    });
  }
}

export = ChatUp;

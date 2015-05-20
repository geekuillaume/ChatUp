var reqwest = require('reqwest');
var io = require('socket.io-client');
var _ = require('lodash');
var es6shim = require('es6-shim');

interface ChatUpConf {
  dispatcherURL: string;
  userInfo: {};
  room: string;
}

interface ChatUpStats {
  msgSent: number;
  msgReceived: number;
  latency: number;
}

class ChatUp {

  _conf: ChatUpConf;
  _socket: any;

  _initPromise: Promise<any>;

  _stats: ChatUpStats;

  constructor(conf: ChatUpConf) {
    this._conf = conf;
    this._stats = {
      msgSent: 0,
      msgReceived:0,
      latency:Infinity
    };
  }

  get stats() {
    return this._stats;
  }

  init = ():Promise<any> => {
    if (this._initPromise)
      return this._initPromise;
    return this._initPromise = this._getChatWorker()
    .then(this._connectSocket)
    .then(this._authenticate)
    .then(this._join)
    .then(() => {
      this._socket.on('msg', () => {
        this._stats.msgReceived++;
      })
      return this;
    });
  }

  say = (message):Promise<any> => {
    return this._waitInit(() => {
      return new Promise<any>((resolve, reject) => {
        this._stats.msgSent++;
        this._socket.emit('say', {msg: message}, (response) => {
          if (!this._isCorrectReponse(response, reject))
            return;
          return resolve();
        });
      })
    });
  }

  onMsg = (handler) => {
    this._waitInit(() => {
      this._socket.on('msg', handler);
    });
  }

  _waitInit = (fct: Function):Promise<any> => {
    return this._initPromise.then(() => {
      return fct();
    });
  }

  _isCorrectReponse = (message, rejectFct):boolean => {
    if (!_.isObject(message)) {
      console.log(message);
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

  _connectSocket = (workerInfos):Promise<any> => {
    return new Promise((resolve, reject) => {
      this._socket = io(workerInfos.host + ':' + workerInfos.port);
      this._socket.on('connect', () => {
        resolve();
      });
      this._socket.on('connect_error', (err) => {
        reject(err);
      });
    });
  }

  _getChatWorker = ():Promise<any> => {
    return reqwest({
      url: this._conf.dispatcherURL,
      method: 'post'
    });
  }

}

export = ChatUp;

var request = require('superagent');
var io = require('socket.io-client');
import _ = require('lodash');
var es6shim = require('es6-shim');
var now = require('performance-now');
var PushStream = require('./lib/nginx-pushstream.js');
import url = require('url');
import {findClass, timeoutPromise, indexesOf} from './lib/helpers';

interface ChatUpConf {
  dispatcherURL: string;
  jwt?: any;
  room: string;
  socketIO: {};
  userCountRefreshTimeout: number;
  additionalChannels?: string[];
}

interface ChatUpStats {
  msgSent: number;
  msgReceived: number;
  latency: number;
  pubCount: number;
  subCount: number;
}

export class ChatUpProtocol {

  static defaultConf: ChatUpConf = {
    dispatcherURL: '/dispatcher',
    room: 'roomDefault',
    socketIO: {
      timeout: 5000,
      reconnectionAttempts: 3,
      forceNew: true
    },
    userCountRefreshTimeout: 20000,
    additionalChannels: []
  }

  _conf: ChatUpConf;
  _pubSocket: any;
  _pushStream: any;
  _worker: any;
  _msgHandlers: Function[] = [];
  _evHandlers: Function[] = [];
  _userCountUpdateHandlers: Function[] = [];
  _error: {type: string; worker: Worker;};
  _dispatcherErrorCount = 0;
  _pubConnected = false;

  _lastReceivedMessageTime = new Date(0);

  _errorCount = 0;

  _userCountRefreshTimeout;
  _initPromise: Promise<any>;

  stats: ChatUpStats = {
    msgSent: 0,
    msgReceived: 0,
    latency:Infinity,
    pubCount: 0,
    subCount: 0
  };

  private _status: string = 'disconnected';
  private _statusChangeHandler: Function[] = [];

  constructor(conf: ChatUpConf) {
    this._conf = conf;
    _.defaults(conf, ChatUpProtocol.defaultConf);
    _.defaults(conf.socketIO, ChatUpProtocol.defaultConf.socketIO);
    this._evHandlers.push(this._evUserCountHandler);
  }

  get status():string {
    return this._status;
  }
  set status(status: string) {
    this._status = status;
    for (let handler of this._statusChangeHandler) {
      handler(status);
    }
  }

  onStatusChange = (handler: Function) => {
    this._statusChangeHandler.push(handler);
  }

  init = ():Promise<any> => {
    if (this._initPromise && !this._error)
      return this._initPromise;


    if (!this._error)
      this.status = 'connecting';
    this._initPromise = timeoutPromise(_.min([this._errorCount * 5000, 30000]))
      .then(this._getChatWorker)
      .then(this._connectSub)
      .then(() => {
        this.status = 'connected';
        this._updateUserCountLoop();
        if (this._conf.jwt)
          return this._connectPub();
        return this;
      }).catch((err) => {
        console.error('Couldn\'t connect, retrying', err);
      });
    return this._initPromise;
  }

  authenticate = () => {
    return this._waitInit(():any => {
      if (this._pubSocket) { // already connected to pub worker
        return true;
      }
      return this._connectPub();
    });
  }

  say = (message):Promise<any> => {
    return this._waitInit(() => {
      return new Promise<any>((resolve, reject) => {
        this.stats.msgSent++;
        var start = now();
        this._pubSocket.emit('say', {msg: message}, (response) => {
          this.stats.latency = now() - start;
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

  onEv = (handler) => {
    this._evHandlers.push(handler)
  }

  onUserCountUpdate = (handler) => {
    this._userCountUpdateHandlers.push(handler)
  }

  _triggerUserCountUpdate = () => {
    for (let handler of this._userCountUpdateHandlers) {
      handler(this.stats);
    }
  }

  _evUserCountHandler = (message) => {
    if (message.ev === 'join') {
      this.stats.pubCount++;
    } else if (message.ev === 'leave') {
      this.stats.pubCount--;
    }
    this._triggerUserCountUpdate();
  }

  _updateUserCountLoop = () => {
    setTimeout(() => {
      request.get(this._conf.dispatcherURL + '/stats/' + this._conf.room)
      .end((err, res) => {
        this._updateUserCountLoop()
        if (err) {
          return;
        }
        this.stats.pubCount = res.body.pubCount;
        // We are not connected so we need to add ourself to the count
        this.stats.subCount = res.body.subCount;
        this._triggerUserCountUpdate();
      });
    }, this._conf.userCountRefreshTimeout)
  }

  _handleMessagesBuffer = (data) => {
    let indexes = indexesOf(data, '.');
    this._lastReceivedMessageTime = new Date(data.substring(0, indexes[0]));
    var channel = data.substring(indexes[0] + 1, indexes[1])
    var messages;
    try {
      messages = JSON.parse(data.substring(indexes[1] + 1));
    } catch (e) {}
    for (let message of messages) {
      message.channel = channel;
      message.date = this._lastReceivedMessageTime;
      if (message.msg) {
        this.stats.msgReceived++;
        for(let handler of this._msgHandlers) {
          handler(message);
        }
      } else if (message.ev) {
        for(let handler of this._evHandlers) {
          handler(message);
        }
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
      rejectFct(message);
      return false;
    }
    return true;
  }

  _connectSub = ():Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      if (this._pushStream) {
        this._pushStream.disconnect()
      }
      this._pushStream = new PushStream.PushStream({
        host: url.parse(this._worker.host).hostname,
        pingtimeout: 1000,
        modes: 'websocket|eventsource|longpolling',
        useSSL: (window.location.protocol == 'https:'),
        messagesPublishedAfter: this._lastReceivedMessageTime,
        messagesControlByArgument: true
      });
      this._pushStream.onmessage = this._handleMessagesBuffer;
      this._pushStream.addChannel(this._conf.room);
      if (this._conf.additionalChannels) {
        for (let i = 0; i < this._conf.additionalChannels.length; i++) {
          this._pushStream.addChannel(this._conf.additionalChannels[i]);
        }
      }
      this._pushStream.onstatuschange = (status) => {
        if (status === PushStream.PushStream.OPEN) {
          this._errorCount = 0;
          return resolve();
        }
      }
      var retryCount = 0;
      this._pushStream.onerror = (err) => {
        console.error(err);
        retryCount++;
        if (retryCount <= 2) {
          this.status = 'subConnectError'
          setTimeout(() => {
            this._pushStream._lastModified = this._lastReceivedMessageTime;
            this._pushStream.connect();
          }, 2000);
        } else {
          this._errorCount++;
          this.status = 'workerSwitch';
          this._error = {type: 'workerSubConnect', worker: this._worker};
          this._pushStream.disconnect();
          this._pushStream = null;
          this.init();
        }
      }
      this._pushStream.connect();
    });
  }

  _connectPub = ():Promise<any> => {
    return new Promise((resolve, reject) => {
      if (this._pubSocket) {
        this._pubConnected = false;
        this._pubSocket.disconnect();
        this._pubSocket.destroy();
        this._pubSocket = null;
      }
      this._pubSocket = io(this._worker.host, this._conf.socketIO);
      this._pubSocket.emit('auth', this._conf.jwt, (response) => {
        if (!this._isCorrectReponse(response, reject)) {
          this.status = 'authError';
          return;
        }
        this._pubSocket.emit('join', {room: this._conf.room}, (response) => {
          if (!this._isCorrectReponse(response, reject)) {
            this.status = 'authError';
            return;
          }
          this._pubConnected = true;
          this.status = 'authenticated';
          this._errorCount = 0;
          if (response.comment && response.comment == 'banned') {
            return resolve({banned: true, banTTL: response.banTTL})
          }
          return resolve();
        });
      });
      var rejectFct = _.after(2, (err) => {
        reject(new Error('Couldn\'t connect to websocket pub'));
      });
      this._pubSocket.on('connect_error', (err) => {
        this._pubConnected = false;
        this.status = 'pubConnectError'
        rejectFct(err);
      });
      this._pubSocket.on('reconnect_failed', () => {
        this._pubConnected = false;
        this.status = 'workerSwitch';
        this._error = {type: 'workerPubConnect', worker: this._worker};
        this._pubSocket.disconnect();
        this._pubSocket.destroy();
        this._errorCount++;
        this.init();
      })
    });
  }

  _getChatWorker = ():Promise<any> => {
    return new Promise((resolve, reject) => {
      this.status = 'gettingWorker';
      var dispatcherRequest = request.post(this._conf.dispatcherURL + '/join/' + this._conf.room);
      if (this._error) {
        dispatcherRequest.send(this._error);
      }
      dispatcherRequest.end((err, res) => {
        if (err) {
          this._dispatcherErrorCount++;
          if (this._dispatcherErrorCount >= 4) {
            this._error = null;
            this._dispatcherErrorCount = 0;
          }
          if (err.status === 418)
            this.status = 'noWorker';
          else
            this.status = 'dispatcherError';
          // Try again after some increasing time
          this._errorCount++;
          return resolve(timeoutPromise(_.min([this._errorCount * 5000, 30000])).then(this._getChatWorker));
        }
        this._error = null;
        this._dispatcherErrorCount = 0;
        this._worker = res.body;
        this.stats.pubCount = res.body.channel.pubCount;
        // We are not connected so we need to add ourself to the count
        this.stats.subCount = res.body.channel.subCount + 1;
        this._triggerUserCountUpdate();
        resolve(res.body);
      });
    });
  }
}

var request = require('superagent');
var io = require('socket.io-client');
import _ = require('lodash');
var es6shim = require('es6-shim');
var now = require('performance-now');
var PushStream = require('./lib/nginx-pushstream.js');
import url = require('url');
import {findClass, timeoutPromise} from './lib/helpers';

interface ChatUpConf {
  dispatcherURL: string;
  jwt?: any;
  room: string;
  socketIO: {};
  nginxPort: number;
  userCountRefreshTimeout: number;
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
    nginxPort: 42632,
    userCountRefreshTimeout: 20000
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
    this._initPromise = this._getChatWorker()
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
    request.get(this._conf.dispatcherURL + '/stats/' + this._conf.room)
    .end((err, res) => {
      if (err) {
        return;
      }
      this.stats.pubCount = res.body.pubCount;
      // We are not connected so we need to add ourself to the count
      this.stats.subCount = res.body.subCount;
      this._triggerUserCountUpdate();
      clearTimeout(this._userCountRefreshTimeout);
      this._userCountRefreshTimeout = setTimeout(this._updateUserCountLoop, this._conf.userCountRefreshTimeout);
    });
  }

  _handleMessagesBuffer = (data) => {
    var messages;
    try {
      messages = JSON.parse(data);
    } catch (e) {}
    for (let message of messages) {
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
      rejectFct(new Error(message.err));
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
        port: this._conf.nginxPort,
        pingtimeout: 1000,
        modes: 'websocket|eventsource|longpolling',
        useSSL: (window.location.protocol == 'https:')
      });
      this._pushStream.onmessage = this._handleMessagesBuffer;
      this._pushStream.addChannel(this._conf.room);
      this._pushStream.onstatuschange = (status) => {
        if (status === PushStream.PushStream.OPEN) {
          return resolve();
        }
      }
      var retryCount = 0;
      this._pushStream.onerror = (err) => {
        retryCount++;
        if (retryCount <= 2) {
          this.status = 'subConnectError'
          setTimeout(() => {
            this._pushStream.connect();
          }, 2000);
        } else {
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
        this._pubSocket.disconnect();
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
          this.status = 'authenticated';
          return resolve();
        });
      });
      var rejectFct = _.after(2, (err) => {
        reject(new Error('Couldn\'t connect to websocket pub'));
      });
      this._pubSocket.on('connect_error', (err) => {
        this.status = 'pubConnectError'
        rejectFct(err);
      });
      this._pubSocket.on('reconnect_failed', () => {
        this.status = 'workerSwitch';
        this._error = {type: 'workerPubConnect', worker: this._worker};
        this._pubSocket = null;
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
          // Try again after 2s
          return resolve(timeoutPromise(2000).then(this._getChatWorker));
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

export class ChatUp {

  static _template = `
    <div class="ChatUpContainer">
      <div class="ChatUpStatus">Status: <span class="ChatUpStatusText">Disconnected</span></div>
      <div class="ChatUpCount">Guest: <span class="ChatUpGuestCount">0</span> - Connected Users: <span class="ChatUpConnectedCount">0</span></div>
      <div class="ChatUpMessages"></div>
      <div class="ChatUpFormContainer">
        <form class="ChatUpForm">
          <input type="text" required="true" class="ChatUpInput">
          <button class="ChatUpFormButton">Send</button>
        </form>
      </div>
    </div>
  `;

  _conf: ChatUpConf;
  _protocol: ChatUpProtocol;

  _el: HTMLElement;
  _statusTextEl: HTMLElement;
  _guestCountEl: HTMLElement;
  _connectedCountEl: HTMLElement;
  _messagesContainer: HTMLElement;
  _messageForm: HTMLElement;
  _messageInput: HTMLInputElement;

  constructor(el: HTMLElement, conf: ChatUpConf) {
    this._el = el;
    this._conf = conf;
    this._protocol = new ChatUpProtocol(this._conf);
    this._protocol.onMsg(this._onMsg);
    this._protocol.onEv(this._onEv);
    this._protocol.onStatusChange(this._protocolStatusChange);
    this._protocol.onUserCountUpdate(this._updateUserCount);
    this._initHTML();
  }

  _updateUserCount = (stats: ChatUpStats) => {
    this._connectedCountEl.innerText = String(stats.pubCount);
    this._guestCountEl.innerText = String(stats.subCount - stats.pubCount);
  }

  _protocolStatusChange = (status: string) => {
    if (status === 'connected') {
      this._statusTextEl.innerText = 'Connected to ' + this._conf.room + ' on server ' + this._protocol._worker.host;
    } else if (status === 'authenticated') {
      this._statusTextEl.innerText = 'Connected as a publisher to ' + this._conf.room + ' on server: ' + this._protocol._worker.host;
    } else if (status === 'gettingWorker') {
      this._statusTextEl.innerText = 'Getting worker from dispatcher';
    } else if (status === 'pubConnectError') {
      this._statusTextEl.innerText = 'Error connecting to worker, retrying...';
    } else if (status === 'subConnectError') {
      this._statusTextEl.innerText = 'Error connecting to sub worker, retrying...';
    } else if (status === 'workerSwitch') {
      this._statusTextEl.innerText = 'Getting another worker';
    } else if (status === 'noWorker') {
      this._statusTextEl.innerText = 'No worker available, retrying...';
    } else if (status === 'authError') {
      this._statusTextEl.innerText = 'Wrong JWT token';
    } else if (status === 'dispatcherError') {
      this._statusTextEl.innerText = 'Error with dispatcher, retrying...';
    }
  }

  _initHTML = () => {
    this._el.innerHTML = ChatUp._template;
    this._statusTextEl = findClass(this._el, 'ChatUpStatusText');
    this._guestCountEl = findClass(this._el, 'ChatUpGuestCount');
    this._connectedCountEl = findClass(this._el, 'ChatUpConnectedCount');
    this._messageForm = findClass(this._el, 'ChatUpForm');
    this._messageInput = <HTMLInputElement>findClass(this._el, 'ChatUpInput');
    this._messagesContainer = findClass(this._el, 'ChatUpMessages');
    this._messageForm.onsubmit = this._formSubmit;
  }

  _formSubmit = (e: Event) => {
    e.preventDefault();
    if (this._messageInput.value.length == 0) {
      return;
    }
    if (this._protocol.status !== 'authenticated') {
      return alert('You need to be authenticated to send a message');
    }
    this._protocol.say(this._messageInput.value).catch(function(err) {console.error(err)});
    this._messageInput.value = "";
  }

  _onMsg = (messageData) => {
    var atBottom = this._messagesContainer.scrollTop === this._messagesContainer.scrollHeight - this._messagesContainer.offsetHeight
    this._messagesContainer.innerHTML += [
      '<div class="ChatUpMessage">',
        '<p class="ChatUpMessageSender">' + messageData.user.name + '</p>',
        '<p class="ChatUpMessageContent">' + messageData.msg + '</p>',
      '</div>'].join('\n');
    if (atBottom) {
      this._messagesContainer.scrollTop = Infinity
    }
  }

  _onEv = (messageData) => {
    var atBottom = this._messagesContainer.scrollTop === this._messagesContainer.scrollHeight - this._messagesContainer.offsetHeight
    if (messageData.ev === 'join') {
      this._messagesContainer.innerHTML += [
        '<div class="ChatUpMessage">',
          '<p class="ChatUpMessageSender">' + messageData.user.name + ' joined</p>',
        '</div>'].join('\n');
    }
    if (messageData.ev === 'leave') {
      this._messagesContainer.innerHTML += [
        '<div class="ChatUpMessage">',
          '<p class="ChatUpMessageSender">' + messageData.user.name + ' left</p>',
        '</div>'].join('\n');
    }
    if (atBottom) {
      this._messagesContainer.scrollTop = Infinity
    }
  }

  authenticate(jwt):Promise<any> {
    if (this._protocol.status !== 'connected' && this._protocol.status !== 'authError') {
      console.error('You need to be connected and not already authenticated to do that');
    } else {
      this._conf.jwt = jwt;
      return this._protocol.authenticate();
    }
  }

  init():Promise<any> {
    return this._protocol.init();
  }

}

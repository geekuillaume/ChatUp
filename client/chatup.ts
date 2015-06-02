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
  userInfo?: any;
  room: string;
  socketIO: {};
  nginxPort: number;
}

interface ChatUpStats {
  msgSent: number;
  msgReceived: number;
  latency: number;
}

export class ChatUpProtocol {

  static defaultConf: ChatUpConf = {
    dispatcherURL: '/dispatcher',
    room: 'roomDefault',
    socketIO: {
      timeout: 5000,
      reconnectionAttempts: 3
    },
    nginxPort: 42632
  }

  _conf: ChatUpConf;
  _pubSocket: any;
  _pushStream: any;
  _worker: any;
  _msgHandlers: Function[] = [];
  _error: {type: string; worker: Worker;};

  _initPromise: Promise<any>;

  _stats: ChatUpStats = {
    msgSent: 0,
    msgReceived: 0,
    latency:Infinity
  };

  private _status: string = 'disconnected';
  private _statusChangeHandler: Function[] = [];

  get status():string {
    return this._status;
  }
  set status(status: string) {
    this._status = status;
    for (let handler of this._statusChangeHandler) {
      handler(status);
    }
  }

  constructor(conf: ChatUpConf) {
    this._conf = conf;
    _.defaults(conf, ChatUpProtocol.defaultConf);
    _.defaults(conf.socketIO, ChatUpProtocol.defaultConf.socketIO);
  }

  get stats() {
    return this._stats;
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
        if (this._conf.userInfo)
          return this._connectPub();
        return this;
      }).catch((err) => {
        console.error('Couldn\'t connect, retrying');
        return this.init();
      });
    return this._initPromise;
  }

  authenticate = (userInfo = this._conf.userInfo) => {
    this._conf.userInfo = userInfo;
    return this._waitInit(() => {
      return this._connectPub();
    });
  }

  say = (message):Promise<any> => {
    return this._waitInit(() => {
      return new Promise<any>((resolve, reject) => {
        this._stats.msgSent++;
        var start = now();
        this._pubSocket.emit('say', {msg: message}, (response) => {
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

  _connectSub = ():Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      this._pushStream = new PushStream.PushStream({
        host: url.parse(this._worker.host).hostname,
        port: this._conf.nginxPort,
        pingtimeout: 1000,
        modes: 'websocket|eventsource|longpolling'
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
          this.init();
        }
      }
      this._pushStream.connect();
    });
  }

  _connectPub = ():Promise<any> => {
    return new Promise((resolve, reject) => {
      this._pubSocket = io(this._worker.host, this._conf.socketIO);
      this._pubSocket.on('connect', () => {
        this._pubSocket.emit('auth', this._conf.userInfo, (response) => {
          if (!this._isCorrectReponse(response, reject))
            return;
          this._pubSocket.emit('join', {room: this._conf.room}, (response) => {
            if (!this._isCorrectReponse(response, reject))
              return;
            this.status = 'authenticated';
            return resolve();
          });
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
        this.init();
      })
    });
  }

  _getChatWorker = ():Promise<any> => {
    return new Promise((resolve, reject) => {
      this.status = 'gettingWorker';
      request.post(this._conf.dispatcherURL)
      .end((err, res) => {
        if (err) {
          if (err.status === 418)
            this.status = 'noWorker';
          else
            this.status = 'dispatcherError';
          // Try again after 2s
          return resolve(timeoutPromise(2000).then(this._getChatWorker));
        }
        this._worker = res.body;
        resolve(res.body);
      });
    });
  }
}

export class ChatUp {

  static _template = `
    <div class="ChatUpContainer">
      <div class="ChatUpStatus">Status: <span class="ChatUpStatusText">Disconnected</span></div>
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
  _messagesContainer: HTMLElement;
  _messageForm: HTMLElement;
  _messageInput: HTMLInputElement;

  constructor(el: HTMLElement, conf: ChatUpConf) {
    this._el = el;
    this._conf = conf;
    this._protocol = new ChatUpProtocol(this._conf);
    this._protocol.onStatusChange(this._protocolStatusChange);
    this._initHTML();
  }

  _protocolStatusChange = (status: string) => {
    if (status === 'connected') {
      this._statusTextEl.innerText = 'Connected to ' + this._conf.room + ' on server ' + this._protocol._worker.host;
    } else if (status === 'authenticated') {
      this._statusTextEl.innerText = 'Connected as ' + this._conf.userInfo.name + ' to ' + this._conf.room + ' on server: ' + this._protocol._worker.host;
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
    } else if (status === 'dispatcherError') {
      this._statusTextEl.innerText = 'Error with dispatcher, retrying...';
    }
  }

  _initHTML = () => {
    this._el.innerHTML = ChatUp._template;
    this._statusTextEl = findClass(this._el, 'ChatUpStatusText');
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

  authenticate(userInfo):Promise<any> {
    this._conf.userInfo = userInfo;
    return this._protocol.authenticate(userInfo);
  }

  init():Promise<any> {
    return this._protocol.init();
  }

}

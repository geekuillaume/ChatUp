var request = require('superagent');
var io = require('socket.io-client');
import _ = require('lodash');
var es6shim = require('es6-shim');
var now = require('performance-now');
var PushStream = require('./lib/nginx-pushstream.js');
import url = require('url');
import {findClass} from './lib/helpers';

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

export class ChatUpProtocol {

  static defaultConf: ChatUpConf = {
    dispatcherURL: '/dispatcher',
    userInfo: {},
    room: 'roomDefault',
    socketIO: {
      timeout: 5000
    },
    nginxPort: 42632
  }

  _conf: ChatUpConf;
  _pubSocket: any;
  _pushStream: any;
  _worker: any;
  _msgHandlers: Function[];

  _initPromise: Promise<any>;

  _stats: ChatUpStats;

  _status: string;

  constructor(conf: ChatUpConf) {
    this._conf = conf;
    _.defaults(conf, ChatUpProtocol.defaultConf);
    _.defaults(conf.socketIO, ChatUpProtocol.defaultConf.socketIO);
    this._msgHandlers = [];
    this._stats = {
      msgSent: 0,
      msgReceived: 0,
      latency:Infinity
    };
    this._status = 'disconnected';
  }

  get stats() {
    return this._stats;
  }

  init = ():Promise<any> => {
    if (this._initPromise)
      return this._initPromise;

    this._status = 'connecting';

    return this._initPromise = this._getChatWorker()
      .then(this._connectSub)
      .then(() => {
        this._status = 'connected';
        return this;
      });

    // if (this._conf.userInfo) { // Only authenticate if got userInfos
    //   promise = promise.then(this._connectPub);
    // }
  }

  authenticate = (userInfo) => {
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
        modes: 'websocket|eventsource|longpolling'
      });
      this._pushStream.onmessage = this._handleMessagesBuffer;
      this._pushStream.addChannel(this._conf.room);
      this._pushStream.onstatuschange = (status) => {
        if (status === PushStream.PushStream.OPEN) {
          return resolve();
        }
      }
      this._pushStream.onerror = (err) => {
        return reject(err);
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
            this._status = 'authenticated';
            return resolve();
          });
        });
      });
      var rejectFct = _.after(2, function() {
        reject(new Error('Couldn\'t connect to websocket pub'));
      });
      this._pubSocket.on('connect_error', (err) => {
        rejectFct();
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
    this._initHTML();
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
    return this._protocol.authenticate(userInfo).then(() => {
      this._statusTextEl.innerText = 'Connected as ' + userInfo.name + ' to ' + this._conf.room + ' on server: ' + this._protocol._worker.host;
    });
  }

  init():Promise<any> {
    return this._protocol.init().then(() => {
      this._statusTextEl.innerText = 'Connected to ' + this._conf.room + ' on server ' + this._protocol._worker.host;
      this._protocol.onMsg(this._onMsg);
    });
  }

}

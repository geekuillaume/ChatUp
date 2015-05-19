interface ChatUpConf {
  dispatcherURL: string;
  userInfo: {};
  room: string;
}

class ChatUp {

  _conf: ChatUpConf;
  _socket: any;

  constructor(conf: ChatUpConf) {
    this._conf = conf;
  }

  init = ():Promise<any> => {
    return this._getChatWorker()
    .then(this._connectSocket)
    .then(this._authenticate)
    .then(this._join)
  }

  _authenticate = ():Promise<any> => {
    return new Promise((resolve, reject) => {
      this._socket.emit('auth', this._conf.userInfo, function(message) {
        if (!_.isObject(message)) {
          return reject(new Error('Wrong return from the server'));
        }
        if (message.status !== 'ok') {
          return reject(new Error(message.err));
        }
        return resolve();
      });
    });
  }

  _join = ():Promise<any> => {
    return new Promise((resolve, reject) => {
      this._socket.emit('join', {room: this._conf.room}, function(message) {
        if (!_.isObject(message)) {
          return reject(new Error('Wrong return from the server'));
        }
        if (message.status !== 'ok') {
          return reject(new Error(message.err));
        }
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

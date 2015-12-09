import ChatUpDispatcher = require('./dispatcher/index');
import ChatUpChatWorker = require('./chatWorker/index');

module ChatUp {
  export var VERSION = "1.0.0";
  export var Dispatcher = ChatUpDispatcher.Dispatcher;
  export var ChatWorker = ChatUpChatWorker.ChatWorker;
};

export = ChatUp;

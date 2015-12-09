"use strict";
var ChatUpDispatcher = require('./dispatcher/index');
var ChatUpChatWorker = require('./chatWorker/index');
var ChatUp;
(function (ChatUp) {
    ChatUp.VERSION = "1.0.0";
    ChatUp.Dispatcher = ChatUpDispatcher.Dispatcher;
    ChatUp.ChatWorker = ChatUpChatWorker.ChatWorker;
})(ChatUp || (ChatUp = {}));
;
module.exports = ChatUp;

var ChatUpDispatcher = require('./dispatcher/index');
var ChatUp;
(function (ChatUp) {
    ChatUp.VERSION = "0.0.1";
    ChatUp.Dispatcher = ChatUpDispatcher.Dispatcher;
})(ChatUp || (ChatUp = {}));
;
module.exports = ChatUp;

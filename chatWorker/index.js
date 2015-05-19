var _ = require('lodash');
var WSHandler = require('./lib/WSHandler');
;
var ChatWorker = (function () {
    function ChatWorker(conf) {
        this._conf = _.defaults(conf, ChatWorker.defaultConf);
        this._wsHandler = new WSHandler(this);
    }
    ChatWorker.prototype.listen = function () {
        return this._wsHandler.listen();
    };
    ChatWorker.defaultConf = {
        redis: {
            port: 6379,
            host: "localhost"
        },
        port: 8001,
        origins: '*'
    };
    return ChatWorker;
})();
exports.ChatWorker = ChatWorker;

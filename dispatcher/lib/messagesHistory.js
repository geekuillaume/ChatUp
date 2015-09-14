var _ = require('lodash');
var logger = require('../../common/logger');
function messagesHistoryHandler(parent) {
    var handler = function (req, res) {
        getChannelMessages(parent, req.params.channelName).then(function (messages) {
            res.send(messages);
        }).catch(function (err) {
            logger.captureError(logger.error('Cannot get messages history from Redis', { err: err }));
            res.sendStatus(500);
        });
    };
    return handler;
}
exports.messagesHistoryHandler = messagesHistoryHandler;
function getChannelMessages(parent, channelName) {
    return new Promise(function (resolve, reject) {
        parent._redisConnection.lrange('chatUp:room:r_' + channelName, 0, -1, function (err, messages) {
            if (err) {
                return reject(err);
            }
            resolve(_.map(messages, function (raw) {
                return JSON.parse(raw);
            }));
        });
    });
}
exports.getChannelMessages = getChannelMessages;

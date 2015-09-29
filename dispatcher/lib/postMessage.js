var _ = require('lodash');
var logger = require('../../common/logger');
var jwt = require('jsonwebtoken');
function postMessageHandler(parent) {
    var handler = function (req, res) {
        if (!_.isString(req.body)) {
            logger.captureError(logger.error('Wrong post message JWT'));
            return res.sendStatus(400);
        }
        jwt.verify(req.body, parent._conf.jwt.key, parent._conf.jwt.options, function (err, decoded) {
            if (err) {
                logger.captureError(logger.error('Wrong post message JWT', { err: err }));
                return res.status(401).send({ status: 'error', err: "Wrong JWT" });
            }
            function wrongJWTContent() {
                logger.captureError(logger.error('Wrong post message JWT content', { decoded: decoded }));
                return res.status(401).send({ status: 'error', err: "Wrong JWT content" });
            }
            if (!_.isArray(decoded)) {
                return wrongJWTContent();
            }
            var toSends = [];
            for (var i = 0; i < decoded.length; i++) {
                var toSend = {};
                if (!_.isString(decoded[i].channel) || !_.isString(decoded[i].msg) || !_.isObject(decoded[i].user)) {
                    return wrongJWTContent();
                }
                toSend.channel = decoded[i].channel;
                toSend.msg = decoded[i].msg;
                toSend.user = decoded[i].user;
                toSends.push(toSend);
            }
            var redisMulti = parent._redisConnection.multi();
            for (var i = 0; i < toSends.length; i++) {
                redisMulti.publish('r_' + toSends[i].channel, JSON.stringify(toSends[i]));
            }
            redisMulti.exec(function (err) {
                if (err) {
                    logger.captureError(err);
                    return res.status(500).send(err);
                }
                res.sendStatus(200);
            });
        });
    };
    return handler;
}
exports.postMessageHandler = postMessageHandler;

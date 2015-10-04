var _ = require('lodash');
var jwt = require('jsonwebtoken');
var logger = require('../../common/logger');
var debug = require('debug')('ChatUp:Dispatcher:BanHandler');
function banHandler(parent) {
    var handler = function (req, res) {
        jwt.verify(req.body, parent._conf.jwt.key, parent._conf.jwt.options, function (err, decoded) {
            if (err) {
                logger.captureError(err);
                debug('Authentication error: Wrong JWT', req.body, err);
                return res.status(401).send({ status: 'error', err: "Wrong JWT" });
            }
            function wrongJWTContent() {
                logger.captureError(new Error('Ban: Wrong JWT content'));
                debug('Authentication error: Wrong JWT content', req.body, decoded);
                return res.status(401).send({ status: 'error', err: "Wrong JWT content" });
            }
            if (!_.isArray(decoded)) {
                wrongJWTContent();
            }
            var toBans = [];
            for (var i = 0; i < decoded.length; i++) {
                var toBan = {};
                if (!_.isString(decoded[i].name) || !_.isString(decoded[i].channel)) {
                    wrongJWTContent();
                }
                toBan.name = decoded[i].name;
                toBan.channel = decoded[i].channel;
                if (_.isNumber(decoded[i].expire)) {
                    toBan.expire = decoded[i].expire;
                }
                toBans.push(toBan);
            }
            var redisMulti = parent._redisConnection.multi();
            for (var i = 0; i < toBans.length; i++) {
                var keyName = 'chatUp:ban:' + toBans[i].channel + ':' + toBans[i].name;
                redisMulti.set(keyName, 1);
                if (toBans[i].expire) {
                    redisMulti.expire(keyName, toBans[i].expire);
                }
                else {
                    redisMulti.persist(keyName);
                }
                redisMulti.publish('r_' + toBans[i].channel, JSON.stringify({
                    ev: "rmUserMsg",
                    data: toBans[i].name
                }));
                debug("Banning %s of channel %s", toBans[i].name, toBans[i].channel);
            }
            redisMulti.exec(function (err) {
                if (err) {
                    logger.captureError(err);
                    res.status(500).send(err);
                }
                res.sendStatus(200);
            });
        });
    };
    return handler;
}
exports.banHandler = banHandler;

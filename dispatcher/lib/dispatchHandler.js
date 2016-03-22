"use strict";
var stats_1 = require('./stats');
var messagesHistory_1 = require('./messagesHistory');
var logger = require('../../common/logger');
var debug = require('debug')('ChatUp:Dispatcher');
var dispatchHandler = function (parent) {
    var handler = function (req, res) {
        var exclude;
        if (req.body && req.body.type && req.body.worker) {
            exclude = req.body.worker.id;
        }
        debug('Getting an available worker');
        parent._workersManager.getAvailable({ excludeId: exclude }).then(function (worker) {
            var channelStats = stats_1.getChannelStats(parent, req.params.channelName);
            if (worker) {
                debug('Sending worker %s at %s', worker.id, worker.host);
                messagesHistory_1.getChannelMessages(parent, req.params.channelName).then(function (messages) {
                    res.send({
                        host: worker.host,
                        id: worker.id,
                        channel: channelStats,
                        messages: messages
                    });
                });
            }
            else {
                logger.captureError(new Error('No worker available'));
                debug('No worker available');
                res.status(418).send({ error: 'No workers available' });
            }
        }).catch(function (err) {
            logger.captureError(err);
            debug('Error while getting worker', err);
            res.status(500).send(err);
        });
    };
    return handler;
};
module.exports = dispatchHandler;

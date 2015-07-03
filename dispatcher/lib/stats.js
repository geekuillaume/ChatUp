var _ = require('lodash');
function statsHandler(parent) {
    var handler = function (req, res) {
        var workers = parent._workersManager.getWorkers();
        var stats = getChannelStats(parent, req.params.channelName);
        stats.limit = req.query.limit || 50;
        stats.skip = req.query.skip || 0;
        stats.clients = getChannelClients(parent, req.params.channelName, {
            limit: stats.limit, skip: stats.skip
        });
        res.send(stats);
    };
    return handler;
}
exports.statsHandler = statsHandler;
function getChannelStats(parent, channelName) {
    var workers = parent._workersManager.getWorkers();
    return {
        subCount: _(workers).map(_.property('subStats.' + channelName)).sum(),
        pubCount: _(workers).map(_.property('pubStats.' + channelName)).map('length').sum()
    };
}
exports.getChannelStats = getChannelStats;
function getChannelClients(parent, channelName, options) {
    if (options === void 0) { options = { limit: 50, skip: 0 }; }
    var workers = parent._workersManager.getWorkers();
    var clients = _(workers).map(_.property('pubStats.' + channelName)).flatten().compact().value();
    return _.slice(clients, options.skip, options.skip + options.limit);
}
exports.getChannelClients = getChannelClients;

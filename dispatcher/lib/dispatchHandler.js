var dispatchHandler = function (parent) {
    var handler = function (req, res) {
        parent._workersManager.getAvailable().then(function (worker) {
            res.send(worker);
        }).catch(function (err) {
            res.status(500).send(err);
        });
    };
    return handler;
};
module.exports = dispatchHandler;

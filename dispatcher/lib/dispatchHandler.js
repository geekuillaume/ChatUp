var dispatchHandler = function (parent) {
    var handler = function (req, res) {
        parent._workersManager.getAvailable().then(function (worker) {
            if (worker) {
                res.send(worker);
            }
            else {
                res.status(418).send({ error: 'No workers available' });
            }
        }).catch(function (err) {
            console.log('Got:', err);
            res.status(500).send(err);
        });
    };
    return handler;
};
module.exports = dispatchHandler;

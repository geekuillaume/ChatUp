var dispatchHandler = function (parent) {
    var handler = function (req, res) {
        var exclude;
        if (req.body && req.body.type && req.body.worker) {
            exclude = req.body.worker.id;
        }
        parent._workersManager.getAvailable({ excludeId: exclude }).then(function (worker) {
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

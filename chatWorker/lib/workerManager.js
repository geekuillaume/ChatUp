var got = require('got');
exports.registerWorker = function (worker) {
    return validateWorkerInfos(worker).then(function () {
    });
};
function validateWorkerInfos(worker) {
    return new Promise(function (resolve, reject) {
        if (worker._conf.host) {
            return resolve();
        }
        got('https://api.ipify.org', function (err, ip) {
            if (err) {
                return reject(new Error("Couldn't get worker ip address"));
            }
            worker._conf.host = ip;
            resolve();
        });
    });
}

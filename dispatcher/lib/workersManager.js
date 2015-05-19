var _ = require('lodash');
var WorkersManager = (function () {
    function WorkersManager(parent) {
        this._parent = parent;
    }
    WorkersManager.prototype.getAvailable = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var worker = _.sample(_this._parent._conf.workers);
            if (worker) {
                resolve(worker);
            }
            else {
                reject(new Error('No worker available'));
            }
        });
    };
    return WorkersManager;
})();
;
module.exports = WorkersManager;

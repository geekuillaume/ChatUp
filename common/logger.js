var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var raven = require('raven');
var client;
function initClient(sentryDSN, options) {
    if (options === void 0) { options = {}; }
    if (!sentryDSN) {
        return;
    }
    client = new raven.Client(sentryDSN, options);
    client.patchGlobal(function (status, e) {
        console.error('Uncaught Exception', e, e.stack);
        process.exit(1);
    });
}
exports.initClient = initClient;
function captureMessage(eventName, eventExtra) {
    if (!client) {
        return;
    }
    client.captureMessage(eventName, eventExtra);
}
exports.captureMessage = captureMessage;
function captureError(error, errorExtra) {
    if (!client) {
        return;
    }
    client.captureError(error, errorExtra);
}
exports.captureError = captureError;
var ErrorExtra = (function (_super) {
    __extends(ErrorExtra, _super);
    function ErrorExtra(name, info) {
        this.info = info;
        _super.call(this, name);
    }
    return ErrorExtra;
})(Error);
function error(name, info) {
    var error = new ErrorExtra(name, info);
    return error;
}
exports.error = error;

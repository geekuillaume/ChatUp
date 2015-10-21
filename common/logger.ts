var raven = require('raven');

var client;

export function initClient(sentryDSN: String, options: Object = {}) {
  if (!sentryDSN) {
    return;
  }
  client = new raven.Client(sentryDSN, options);
  client.patchGlobal((status, e) => {
    console.error('Uncaught Exception', e, e.stack);
    process.exit(1);
  })
}

export function captureMessage(eventName: String, eventExtra?: Object) {
  if (!client) {
    return;
  }
  client.captureMessage(eventName, eventExtra);
}

export function captureError(error: Error, errorExtra?: Object) {
  if (!client) {
    return;
  }
  client.captureError(error, errorExtra)
}

class ErrorExtra extends Error {
  info: Object;
  constructor (name:string, info: Object) {
    this.info = info
    super(name);
  }
}

export function error(name: string, info?: Object) {
  var error = new ErrorExtra(name, info);
  return error;
}

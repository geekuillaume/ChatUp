var debug = require('debug')('ChatUp:ChatWorker:middleware');
import {ChatUpMiddleware, ChatUpMiddlewareContext} from '../';

export function runMiddlewares(middlewares: ChatUpMiddleware[], ctx: ChatUpMiddlewareContext) {
  return new Promise<void>(function(resolve, reject) {
    var results = []; // Used to prevent double callback
    debug('Starting %s middlewares', middlewares.length);
    runMiddleware(0);
    function runMiddleware(i: number) {
      if (i >= middlewares.length) {
        debug('Finished all middlewares');
        return resolve();
      }
      var next = function(err) {
        if (results[i]) {
          console.error("Double next in middleware %s, ignoring, verify your function", i, err, middlewares[i].toString());
          return;
        }
        results[i] = true;
        if (err) {
          debug('Middleware %s throwed an error', i, err);
          return reject(err);
        } else {
          debug('Middleware %s finished', i);
          return runMiddleware(i + 1);
        }
      }
      debug('Running middleware %s', i);
      middlewares[i](ctx, next);
    }
  });
}

export function banMiddleware(ctx: ChatUpMiddlewareContext, next) {
  ctx.room.verifyBanStatus(ctx.user).then((info) => {
    if (info.isBanned) {
      return next({status: 'error', err: 'banned', ttl: info.banTTL})
    }
    next();
  }).catch((err) => {
    next(err);
  });
}

var debug = require('debug')('ChatUp:ChatWorker:middleware');
function runMiddlewares(middlewares, ctx) {
    return new Promise(function (resolve, reject) {
        var results = new Array(middlewares.length);
        debug('Starting %s middlewares', middlewares.length);
        runMiddleware(0);
        function runMiddleware(i) {
            if (i >= middlewares.length) {
                debug('Finished all middlewares');
                return resolve();
            }
            function next(err) {
                if (results[i]) {
                    console.error("Double next or stopAndRespond in middleware %i, ignoring, verify your function", i + 1);
                    return;
                }
                results[i] = true;
                if (err) {
                    debug('Middleware %s throwed an error', i, err);
                    return reject(err);
                }
                else {
                    debug('Middleware %s finished', i);
                    return runMiddleware(i + 1);
                }
            }
            debug('Running middleware %s', i);
            middlewares[i](ctx, next);
        }
    });
}
exports.runMiddlewares = runMiddlewares;
function banMiddleware(ctx, next) {
    ctx.room.verifyBanStatus(ctx.user).then(function (info) {
        if (info.isBanned) {
            return next({ status: 'error', err: 'banned', ttl: info.banTTL });
        }
        next();
    }).catch(function (err) {
        next(err);
    });
}
exports.banMiddleware = banMiddleware;

var net = require('net');
var cluster = require('cluster');
var _ = require('lodash');
function hash(ip, seed) {
    var hash = ip.reduce(function (r, num) {
        r += parseInt(num, 10);
        r %= 2147483648;
        r += (r << 10);
        r %= 2147483648;
        r ^= r >> 6;
        return r;
    }, seed);
    hash += hash << 3;
    hash %= 2147483648;
    hash ^= hash >> 11;
    hash += hash << 15;
    hash %= 2147483648;
    return hash >>> 0;
}
var defaultOptions = {
    threads: require('os').cpus().length,
    sticky: true
};
var sticky = function (callback, opt) {
    var options = _.defaults(opt, defaultOptions);
    var server;
    if (cluster.isMaster) {
        var workers = [];
        for (var i = 0; i < options.threads; i++) {
            !function spawn(i) {
                workers[i] = cluster.fork();
                workers[i].on('exit', function () {
                    console.error('sticky-session: worker died');
                    spawn(i);
                });
            }(i);
        }
        var seed = ~~(Math.random() * 1e9);
        server = net.createServer(function (c) {
            var worker;
            if (options.sticky) {
                var ipHash = hash((c.remoteAddress || '').split(/\./g), seed);
                worker = workers[ipHash % workers.length];
            }
            else {
                worker = _.sample(workers);
            }
            worker.send('sticky-session:connection', c);
        });
    }
    else {
        server = typeof callback === 'function' ? callback() : callback;
        process.on('message', function (msg, socket) {
            if (msg !== 'sticky-session:connection')
                return;
            server.emit('connection', socket);
        });
        if (!server)
            throw new Error('Worker hasn\'t created server!');
        var oldListen = server.listen;
        server.listen = function listen() {
            var lastArg = arguments[arguments.length - 1];
            if (typeof lastArg === 'function')
                lastArg();
            return oldListen.call(this, null);
        };
    }
    return server;
};
module.exports = sticky;

var net = require('net');
var cluster = require('cluster');
var _ = require('lodash');
var debug = require('debug');
var masterDebug = debug('ChatUp:ChatWorker:master');
var slaveDebug = debug('ChatUp:ChatWorker:slave');
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
    sticky: true,
    data: {}
};
exports.sticky = function (file, opt) {
    var options = _.defaults(opt, defaultOptions);
    var server;
    cluster.setupMaster({
        exec: file
    });
    if (cluster.isMaster) {
        var workers = [];
        function spawn(i) {
            workers[i] = cluster.fork();
            workers[i].on('exit', function () {
                console.error('sticky-session: worker died');
                spawn(i);
            });
            workers[i].send({ type: 'sticky-startconfig', data: opt.data });
            workers[i].on('error', function (err) {
                console.log('Error:', err);
            });
        }
        for (var i = 0; i < options.threads; i++) {
            spawn(i);
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
            masterDebug('Sending connection from %s to a worker %s', c.remoteAddress, worker);
            worker.send('sticky-session:connection', c);
        });
    }
    return { server: server, workers: workers };
};
exports.stickyClient = function (cb) {
    process.on('message', function (message) {
        if (message.type !== 'sticky-startconfig') {
            return;
        }
        var server = cb(message.data);
        if (!server)
            throw new Error('Worker hasn\'t created server!');
        process.on('message', function (msg, socket) {
            if (msg !== 'sticky-session:connection')
                return;
            slaveDebug('Got new connection from master %s', socket);
            server.emit('connection', socket);
        });
        var oldListen = server.listen;
        server.listen = function listen() {
            var lastArg = arguments[arguments.length - 1];
            if (typeof lastArg === 'function')
                lastArg();
            return oldListen.call(this, null);
        };
    });
};

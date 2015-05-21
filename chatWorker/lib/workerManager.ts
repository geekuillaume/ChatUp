var got = require('got');
import {ChatWorker} from '../index';
import redis = require('redis');

export var registerWorker = function(worker: ChatWorker):Promise<void> {
  return validateWorkerInfos(worker).then(function() {

  });
};

function validateWorkerInfos(worker: ChatWorker): Promise<void> {
  return new Promise<void>(function(resolve, reject) {
    if (worker._conf.host) {
      return resolve();
    }
    got('https://api.ipify.org', function(err, ip) {
      if (err) {
        return reject(new Error("Couldn't get worker ip address"));
      }
      worker._conf.host = ip;
      resolve();
    });
  });
}

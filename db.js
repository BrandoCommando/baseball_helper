const { REDIS_URL } = require('./config');
const redis = require('redis');

class Db {
  constructor(name) {
    this.name = name;
    this.opts = this.getConnectOpts(false);
  }
  getConnectOpts() { return this.getConnectOpts(false); }
  getConnectOpts(legacyMode)
  {
    const ccopts = {url:REDIS_URL, legacyMode:legacyMode, connect_timeout:2, tls:{rejectUnauthorized:false, requestCert:true, agent: false, checkServerIdentity: () => undefined }};
    if(REDIS_URL.indexOf('rediss://')>-1)
        ccopts.socket = { tls: true, rejectUnauthorized: false };
    return ccopts;
  }
  createClient() { return this.createClient(false); }
  createClient(connect) {
    const client = redis.createClient(this.opts);
    client.on('ready',()=>{
      console.log(`${this.name} connected: ${REDIS_URL}`);
    });
    client.on('error',(e)=>{
      console.error(`${this.name} error`,e);
    });
    if(connect) client.connect();
    return client;
  }
};

module.exports = Db;
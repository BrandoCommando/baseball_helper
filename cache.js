const Db = require('./db');
const db = new Db('Cache redis');


class Cache {
  constructor(req,res)
  {
    this.cache = {};
    this.connected = false;
    this.client = false;
    this.req = req;
    this.res = res;
  }
  getClient(skip_connect)
  {
    if(!this.client||!this.connected)
    {
      const client = db.createClient();
      if(!!client) {
				client.on('error', (e) => {
					this.connected = false;
				});
				client.on('ready', () => {
					this.connected = true;
				});
			}
      this.client = client;
    }
//     client.on('ready', () => console.log('Redis connected'));
    if(!skip_connect&&!this.connected&&!!this.client)
    {
      this.client.connect();
    }
    return this.client;
  }
  keys(pattern)
  {
    const client = this.getClient();
    return client.keys(pattern);
  }
  usage(key)
  {
    return this.getClient().sendCommand(['memory','usage',key]);
  }
  del(key)
  {
    const client = this.getClient(false);
    return client.del(key);
  }
  get(key)
  {
//     console.debug(`Cache get ${key}`);
    const client = this.getClient(false);
    return client.get(key);
  }
  ckvp(c,key,val)
  {
    var setting = val;
    if(typeof(val)=="number") setting = "" + val;
    if(typeof(val)!="string") setting = JSON.stringify(val);
    let success = true;
    return this.getClient(false)
      .sendCommand([c,key,setting]);
  }
  lpush(key,val)
  {
    return this.ckvp('lpush',key,val);
  }
  rpush(key,val)
  {
    return this.ckvp('rpush',key,val);
  }
  pcommands(arr)
  {
    return new Promise((resolve,reject)=>{
      return this.getClient(false).sendCommand(arr)
        .then((r)=>resolve(r))
        .catch((e)=>reject(e));
    });
  }
  lrange(key,start,stop)
  {
    return this.getClient(false).lRange(key,start,stop);
  }
  ltrim(key,start,stop)
  {
    return this.getClient(false).lTrim(key,start,stop);
  }
  llen(key)
  {
    return this.getClient(false).lLen(key);
  }
  hset(key,field,val)
  {
    return new Promise((resolve,reject)=>{
      if(val===undefined||field===undefined||key===undefined) reject(`Invalid params: ${key}, ${field}, ${val}`);
      var setting = val;
      if(typeof(val)=="number") setting = "" + val;
      if(typeof(val)!="string") setting = JSON.stringify(val);
      if(typeof(key)!="string") key = JSON.stringify(key);
      if(typeof(field)!="string") field = JSON.stringify(field);
      const client = this.getClient(false);
			if(!client&&!!this.res) {
        if(!!this.req.session)
          this.req.session[`${key}_${field}`] = setting
        else if(field.indexOf("token")>-1)
          this.res.cookie(`${key}_${field}`, setting);
        return resolve(1);
      }
			return client.sendCommand(['hset',key,field,setting])
        .then((res)=>resolve({status:res,setting}))
        .catch((e)=>reject(e));
    });
  }
  hsetall(key,values)
  {
    return new Promise((resolve,reject)=>{
      const cmd = ['hset',key];
      for(var field of Object.keys(values))
      {
        cmd.push(field);
        var setting = values[field];
        if(typeof(setting)=="number") setting = `${setting}`;
        if(typeof(setting)!="string") setting = JSON.stringify(setting);
        cmd.push(setting);
      }

      const client = this.getClient(false);
      if(!client&&!!this.res) {
        if(!!this.req.session)
          this.req.session[`${key}_${field}`] = setting
        else if(field.indexOf("token")>-1)
          this.res.cookie(`${key}_${field}`, setting);
        return resolve(1);
      }
			return client.sendCommand(cmd)
        .then((res)=>resolve(res))
        .catch((e)=>reject(e));
    });
  }
  hexists(key,field)
  {
    return this.getClient(false).hExists(key,field);
  }
  hget(key,field)
  {
  	const client = this.getClient(false);
    if(!client&&!!this.req)
    {
      if(this.req.session&&this.req.session[`${key}_${field}`])
          return this.req.session[`${key}_${field}`];
      if(this.req.cookies[`${key}_${field}`])
        return this.req.cookies[`${key}_${field}`];
    }
  	if(!client) return undefined;
    return client.hGet(key,field);
  }
  hgetall(key)
  {
    return this.getClient(false).hGetAll(key);
  }
  hkeys(key)
  {
    return this.getClient(false).hKeys(key);
  }
  hvals(key)
  {
    return this.getClient(false).hVals(key);
  }
  hdel(key,field)
  {
    const client = this.getClient(false);
    const path = `${key}_${field}`;
    if(!!this.req.session)
      this.req.session[path] = undefined;
    if(!!this.req.cookies[path])
      this.res.cookie(path, null, {expires:new Date(Date.now()-10)});
    if(!!client)
      return this.getClient(false).hDel(key,field);
  }
  hincr(key,field)
  {
    return this.getClient(false).sendCommand(["hIncrBy",key,field,"1"]);
  }
  tryget(key,fallback)
  {
    return this.get(key).catch(()=>{return fallback});
  }
  ping()
  {
    if(!this.client||!this.client.ping) return false;
    this.client.ping()
      .catch((e)=>{
        this.connected = false;
        });
  }
  set(key,val)
  {
    return new Promise((resolve,reject)=>{
      if(val===undefined) reject('Undefined value');
      const client = this.getClient(false);
      if(!this.connected) console.warn("Slow down!");
      var setting = val;
      if(typeof(val)=="number") setting = "" + val;
      if(typeof(val)!="string") setting = JSON.stringify(val);
  //     console.debug(`Cache set ${key} to ` + typeof(val));
      client.set(key,setting)
        .then((res)=>resolve(res))
        .catch((e)=>{
          console.error(`Error setting ${key} to ${val}`, e);
          reject(e);
        });
    });
  }
  append(key,val,max)
  {
    if(this.cache[key])
    {
      this.cache[key].push(val);
      this.ping();
      this.set(key, this.cache[key]);
      return Promise.resolve(true);
    }
    return this.get(key)
      .then((s)=>{
        let arr = [];
        try {
          arr = JSON.parse(s);
        } catch(e) {
          console.error(`Error parsing: ${s}`, e);
          arr = [];
        }
        arr.push(val);
        if(max&&arr.length>max)
          arr = arr.slice(max-arr.length);
        this.cache[key] = arr;
        this.ping();
        this.set(key,arr);
      })
      .catch(_=>{
        this.cache[key] = [val];
        this.ping();
        this.set(key,[val]);
      });
  }
  quit()
  {
    if(this.client)
      this.client.quit();
    this.client = this.connected = false;
  }
}
function stringify(val,depth,max)
{
  if(!isNaN(val))
    return "" + val;
  if(typeof(val)=="string") {
    if(val.length>100)
      return "'" + val.substring(0,100).replace("'", "\\'") + "...'";
    if(val.substr(0,1)=="'"&&val.substr(-1)=="'"&&val.length>1)
      return val;
    else if(val.substr(0,1)=='"'&&val.substr(-1)=='"'&&val.length>1)
      return val;
    return "'" + val.replace("'", "\\'") + "'";
  }
  const prefix = depth!=undefined?(isNaN(depth)?depth:"".padEnd(depth,"\t")):"";
  const maxed = max != undefined && ((isNaN(depth)&&depth.length>=max)||(!isNaN(depth)&&depth>=max));
  const deeper = depth==undefined?undefined:(!maxed?(isNaN(depth)?depth+depth:depth+1):"");
  const nl = depth!=undefined?"\n":"";
  const sp = depth!=undefined?" ":"";
  if(typeof(val)=="object"&&Array.isArray(val))
  {
    let aval = '';
    val.forEach((v,i)=>{
      const kid = stringify(v, deeper, max);
      aval += `${prefix}${kid},${nl}`;
    });
    if(aval) aval = aval.substr(0, aval.length - 1 - (depth ? 1 : 0));
    return `${prefix}[${nl}${aval}${nl}${prefix}]`;
  }
  else if(typeof(val)=="object")
  {
    let oval = '';
    for(var k in val)
    {
      const kid = stringify(val[k], deeper, max);
      oval += `${prefix}${k}:${sp}${kid},${nl}`;
    }
    if(oval) oval = oval.substr(0, oval.length - 1 - (depth ? 1 : 0));
    return `{${nl}${oval}${nl}${prefix}}`;
  } else if(val&&val.toString)
    return stringify(val.toString(), deeper, max);
  return JSON.stringify(val);
}

module.exports = Cache;
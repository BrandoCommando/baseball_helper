const CryptoJS = require("crypto-js");
const bcrypt = require("bcrypt");
const fetch = require('node-fetch');
const { ScoreBooks, ScoreBook, ScoreInning, ScoreBlock } = require('./scorebook');
const { Baseball, Game, Team } = require("./baseball");
const Util = require("./util");
const { PlayerStats, PlayerStatTitles } = require("./PlayerStats");
const { writeEventHTML, writeScorebook, writeScripts, writeMain } = require('./html_generator');
const Cache = require("./cache");

class gamechanger {
  /**
   * 
   * @param {*} email 
   * @param {*} password 
   * @param {Cache} cache
   */
  constructor(email,password,cache) {
    this.email = email;
    this.password = password;
    this.requests = [];
    // s.CryptoUtils.toHex(s.CryptoUtils.randomBytes(16))
    this.clientId = "c66bec0d-0664-4802-be6d-07ad063cf120";
    this.signKey = "Xoz8wTJ46Q2+Eh/Ql90Bdnyfo/pJpJbNH8tDxcU95PY=";
    this.cache = cache;
    this.deviceId = ""; //"202072e26b3f013628839d4fef57e47c";
    this.lastSignature = false;
    this.token = false;
    this.players = {};
    this.teams = {};
    this.games = [];
    this.schedule = [];
    this.organizations = {};
    this.proxies = {};
    if(typeof(email)=="object")
      this.token = email;
  }
  flatten(e) {
    if(Array.isArray(e))
      return e.flatMap(this.flatten);
    switch(typeof e) {
      case "object":
        if(!e) return ["null"];
        let flat = !Object.keys(e).find((k)=>typeof(e[k])=="object");
        if(!flat) return [JSON.stringify(e)];
        else return Object.keys(e).sort().flatMap((t)=>this.flatten(e[t]));
      case "string":
        return [e];
      case "boolean":
      case "bigint":
      case "number":
        return ["".concat(e)];
      case "undefined":
      case "function":
      case "symbol":
        return [];
    }
    throw Error("Unknown type: ".concat(typeof e));
  }
  signPayload(key, params, timestamp, nonce, previousSignature) {
    const keyd = CryptoJS.enc.Base64.parse(key);
    const nd = CryptoJS.enc.Base64.parse(nonce);
    const pflat = this.flatten(params).join("|");
    const h = CryptoJS.algo.HMAC.create(CryptoJS.algo.SHA256, keyd)
    return h.update("".concat(timestamp, "|")),
      h.update(nd),
      h.update("|"),
      h.update(pflat),
      previousSignature && (h.update("|"), h.update(CryptoJS.enc.Base64.parse(previousSignature))),
      CryptoJS.enc.Base64.stringify(h.finalize())
  }
  async generateDeviceIdIfNeeded() {
    if(this.deviceId) return this.deviceId;
    let deviceId = await this.cache.hget('gamechanger', `${this.email}_deviceId`).catch();
    if(!deviceId)
    {
      deviceId = CryptoJS.enc.Hex.stringify(CryptoJS.lib.WordArray.random(16));
      await this.cache.hset('gamechanger', `${this.email}_deviceId`, deviceId).catch();
    }
    this.deviceId = deviceId;
    return deviceId;
  }
  async fetchApi(post, action, oheaders) {
    if(!action&&typeof(post)=="string")
    {
      action = post;
      post = false;
    }
    if(!action) action = "auth";
    if(action=="auth") {
      await this.generateDeviceIdIfNeeded();
      if(this.code&&post.type!="mfa-code")
      {
        await this.cache.hget('gamechanger', `${this.email}_sigtoken`).then((sigt)=>{
          console.log("Found sigtoken", sigt);
          if(typeof(sigt)=="string")
            sigt = JSON.parse(sigt);
          if(Array.isArray(sigt))
          {
            this.lastSignature=sigt[0];
            this.token = sigt[1];
          }
        });
        await this.cache.hdel('gamechanger', `${this.email}_sigtoken`);
        const challenge = await this.fetchApi({type:"mfa-code",code:this.code});
        this.code = false;
        let access_token = false;
        if(challenge?.type=="password-required")
        {
          let password = this.password;
          if(challenge.password_params?.salt)
            password = bcrypt.hashSync(password, challenge.password_params.salt);
          if(challenge.challenge_params?.salt)
            password = bcrypt.hashSync(password, challenge.challenge_params.salt);
          access_token = await this.fetchApi({type:"password",password:password});
        } else {
          console.warn("Unknown user-auth type", challenge);
        }
        if(access_token?.access?.data)
        {
          await this.storeToken(access_token);
        }
      }
    }
    if(action!="auth"&&!this.token) await this.getToken();
    if(action!="auth"&&!this.token)
      await this.startAuth();
    if(action!="auth"&&!this.token) return false;
    if(typeof(action)=="string"&&action.startsWith('/')) action = action.substring(1);
    const headers = {
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      "sec-ch-ua": "\"Chromium\";v=\"122\", \"Not(A:Brand\";v=\"24\", \"Google Chrome\";v=\"122\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"macOS\"",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      "Referer": "https://web.gc.com/",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "gc-app-name": "web",
      "gc-device-id": this.deviceId
    }
    if(!!post)
    {
      if(post.type=="refresh")
        this.lastSignature = false;
      headers["gc-app-version"] = "0.0.0";
      headers["gc-client-id"] = this.clientId;
      const timestamp = Math.floor(Date.now()/1000);
      const nonce = CryptoJS.enc.Base64.stringify(CryptoJS.lib.WordArray.random(32));
      headers["gc-timestamp"] = timestamp;
      headers["gc-signature"] = "".concat(nonce, ".").concat(this.signPayload(this.signKey, post, timestamp, nonce, this.lastSignature));
      headers["content-type"] = "application/json; charset=utf-8";
    }
    if(this.token)
    {
      if(typeof this.token == "string")
        headers["gc-token"] = this.token;
      else if(!!this.token?.token)
        headers["gc-token"] = this.token.token;
      else if(!!this.token?.access?.data)
      {
        if(post?.type=="refresh")
          headers["gc-token"] = this.token.refresh.data;
        else
          headers["gc-token"] = this.token.access.data;
      }
    }
    let method = post ? "POST" : "GET";
    if(oheaders?.method)
    {
      method = oheaders.method;
      delete oheaders.method;
    }
    if(!!oheaders)
      Object.keys(oheaders).forEach((key)=>{
        headers[key] = oheaders[key];
      });
    // if(action != "auth")
    //   headers['accept'] = 'application/vnd.gc.com.user+json; version=0.1.0';
    const opts = {headers,method,mode:"cors"};
    if(post) opts.body = JSON.stringify(post);
    const rheaders = {};
    console.log(new Date().toLocaleTimeString() + " " + action, opts.body);
    const result = await fetch("https://api.team-manager.gc.com/"+action, opts)
      .then((r)=>{
        if(r.headers)
          r.headers.forEach((val,key)=>{
            if(key.indexOf('gc-')>-1)
              rheaders[key]=val;
          });
        let isJson = false;
        if(r.headers.has("content-type")&&r.headers.get("content-type").indexOf("json")>-1)
          isJson = true;
        if(r.headers.has("gc-signature"))
          this.lastSignature = r.headers.get("gc-signature").split(".")[1];
        if(isJson) return r.json();
        return r.text();
      });
    // if(action=="auth") console.log("Auth response", JSON.stringify(result), JSON.stringify(rheaders));
    // if(rheaders['gc-signature']) this.lastSignature = rheaders['gc-signature'];
    this.requests.push({request:action,post,response:result});
    return result;
  }
  async getFullEventVideos(team_id, event_id)
  {
    return new Promise(async(resolve,reject)=>{
      const output = await this.getApi(`teams/${team_id}/schedule/events/${event_id}/video-stream/assets`)
          .then((assets)=>Array.isArray(assets)?[...assets].reduce((out,asset)=>{out[asset.id]=asset;return out},{}):[]);
        let expired = false;
        await this.getApi(`teams/${team_id}/schedule/events/${event_id}/video-stream/assets/playback`)
          .then((assets)=>Array.isArray(assets)?[...assets].reduce((out,asset)=>{out[asset.id]=asset;return out},{}):[])
          .then((assets)=>{
            for(var id of Object.keys(assets))
            {
              output[id] = {...output[id],...assets[id]};
              const v = gamechanger.checkVideoExpiration(assets[id]);
              if(!v?.expiration) {
                console.warn(`Bad checkVideoExpiration`, {v, asset:assets[id]})
                continue;
              }
              if(v.expiration&&v.expiration<new Date())
              {
                expired = true;
                break;
              } else output[id].expired = false;
              output[id] = {...output[id],...v};
            }
          });
        if(expired) return await this.getApi(`teams/${team_id}/schedule/events/${event_id}/video-stream/assets/playback`,true)
          .then((assets)=>{
            if(assets.length)
              assets.forEach((asset)=>{
                if(!output[asset.id])
                  output[asset.id] = asset;
                else output[asset.id] = {...output[asset.id],...asset};
              });
          });
      const keys = Object.keys(output);
      if(!keys.length) resolve(output);
      for(const vid of keys)
        await this.cache.hset('gamechanger', `video_${vid}`, output[vid])
          .catch((e)=>{console.error(`Bad hset for video_${vid}`, output[vid])});
      resolve(Object.values(output));
    });
  }
  async getClipVideo(clip_id,nocache)
  {
    return this.getApi(`clips/${clip_id}/playback-data?kind=player`,nocache).then(gamechanger.checkVideoExpiration);
  }
  static checkVideoExpiration(v) {
    if(typeof(v)=="object"&&v.cookies&&v.cookies['CloudFront-Policy'])
    {
      const ps = CryptoJS.enc.Base64.parse(v.cookies['CloudFront-Policy']).toString(CryptoJS.enc.Utf8).replace(/\x00$/, "");
      if(ps.startsWith('{')&&ps.endsWith('}'))
      {
        const policy = JSON.parse(ps);
        if(policy.Statement.length&&policy.Statement[0].Condition?.DateLessThan)
          v.expiration = new Date(policy.Statement[0].Condition.DateLessThan['AWS:EpochTime']*1000);
        else v.policy = policy;
      } else console.warn('checkVideoExpiration bad ps', {ps});
    }
    else if (Array.isArray(v)) {
      return [...v].map(gamechanger.checkVideoExpiration);
    }
    else console.warn('checkVideoExpiration bad arg', {v});
    return v;
  }
  
  async getPlayerEventClips(event_id)
  {
    return new Promise(async(resolve,reject)=>{
      let page = 0;
      let more = true;
      const output = {};
      if(!await this.cache.hget('gamechanger', `clips_${event_id}`).then((clips)=>{
        if(typeof(clips)=="string") clips = JSON.parse(clips);
        if(!clips||!Array.isArray(clips)) return false;
        for(var clip of [...clips])
          output[clip.clip_metadata_id] = clip;
        return true;
        }))
        {
          while(more) {
            await this.fetchApi({
                      "select":{"kind":"player","include_totals":true},
                      "match_all":{event_id},"limit":36,
                      "sort":[{"by":"timestamp","order":"asc"}],
                      "paging":"page",
                      "offset":page},'clips/search/v2')
              .then((res)=>{
                page = res.next_offset;
                more = !!res.next_offset;
                if(res?.hits)
                  for(var hit of res.hits)
                    output[hit.clip_metadata_id] = hit;
              });
          }
          await this.cache.hset('gamechanger', `clips_${event_id}`, Object.values(output)).catch();
        }

      // console.log(`getPlayerEventClips Output`, output);
      const clipcheck = (clips) => {
        for(var clip of [...clips])
        {
          if(!clip.clip_id) console.warn('Bad clip', clip);
          else if(!output[clip.clip_id]) {
            console.warn('Bad clip output', clip);
            output[clip.clip_id] = clip;
          }
          else {
            const clip_id = clip.clip_id;
            ['url','cookies','expiration'].forEach((key)=>{
              if(clip[key])
                output[clip_id][key] = clip[key];
            });
          }
        }};
      const clipids = Object.keys(output);
      await Promise.all(clipids.map((clipid)=>this.getClipVideo(clipid)))
        .then(clipcheck);
      const now = new Date();
      let expired = !!clipids.find((clipid)=>output[clipid].expiration<now);
      if(expired)
        await Promise.all(clipids.map((clipid)=>this.getClipVideo(clipid,true)))
          .then(clipcheck);
      resolve(Object.values(output));
    });
  }
  buildStreamEventFillPosition(position,team_id,player_id)
  {
    return {code:"fill_position",attributes:{position,team_id,player_id}};
  }
  buildStreamEvent(data)
  {
    const sevent = {
      id:Util.uuid(),
      event_data:JSON.stringify({
        id:Util.uuid(),
        createdAt:Date.now(),
        code:data.code,
        attributes:data.attributes
        })};
    if(data.stream_id) sevent.stream_id = data.stream_id;
    if(data.sequence_number) sevent.sequence_number = data.sequence_number;
    return sevent;
  }
  async sendStreamEvent(stream_id,sequence_number,data)
  {
    const game_stream_event = this.buildStreamEvent({stream_id:stream_id,sequence_number:sequence_number,code:data.code,attributes:data.attributes});
    return this.fetchApi({game_stream_event},'game-stream-events');
  }
  async getApi(action,nocache,headers)
  {
    return new Promise(async(resolve,reject)=>{
      let data = false;
      let post = false;
      let ckey = "";
      if(Array.isArray(action)&&action.length>=2)
      {
        post = action[1];
        if(action.length>2)
          ckey = action[2];
        action = action[0];
      } else if(typeof(action)=="object"&&action.action)
      {
        if(action.body) post = action.body;
        else if(action.post) post = action.post;
        if(action.key) ckey = action.key;
        action = action.action;
      } else {
        ckey = action + (action.indexOf("me/")>-1 ? this.email : "");
        if(post)
        {
          ckey += ":";
          if(typeof(post)=="object")
            ckey += CryptoJS.enc.Base64url.stringify(JSON.stringify(post));
          else ckey += post;
        }
      }
      
      if(!!this.cache?.client&&!nocache)
      {
        data = await this.cache.hget("gamechanger", ckey).catch();
        if(typeof data == "string" && data.length >= 2)
        {
          try {
            data = JSON.parse(data);
          } catch(e) {
            data = false;
          }
        }
        if(typeof(data) == "object" && data != null && !data.error)
        {
          this.requests.push({request:ckey,cache_response:data});
          return resolve(data);
        }
      }
      data = await this.fetchApi(post, action, headers);
      if(!data&&nocache)
        return this.getApi([action,post],false,headers);
      if(!!this.cache&&!!data&&!!this.cache.client)
      {
        await this.cache.hset("gamechanger", ckey, JSON.stringify(data)).catch();
      }
      return resolve(data);
    });
  }
  async storeToken(access_token)
  {
    if(access_token?.access?.expires)
      access_token.access.expiry = new Date(access_token.access.expires*1000);
    if(access_token?.refresh?.expires)
      access_token.refresh.expiry = new Date(access_token.refresh.expires*1000);
    this.token = access_token;
    if(!!this.cache)
      await this.cache.hset("gamechanger_tokens", this.email, access_token).catch();
    else {
      console.warn("No cache for GC");
      return false;
    }
    return this.token;
  }
  async refreshToken(skipCache)
  {
    const access_token = await this.fetchApi({type:"refresh"});
    if(!!skipCache) return access_token;
    console.log("Refresh token", access_token);
    if(access_token?.type=="token")
      return await this.storeToken(access_token);
  }
  async getToken()
  {
    if(this.token?.access?.data)
      if(this.token.access.expires * 1000 > Date.now())
        return this.token;
    if(!!this.cache)
    {
      const at = await this.cache.hget("gamechanger_tokens", this.email);
      if(typeof at == "string")
      {
        const jt = JSON.parse(at);
        if(jt?.type=="token")
        {
          const nowsec = Math.floor(Date.now() / 1000);
          if(jt.access.expires > nowsec + 60)
            return this.token = jt;
          if(jt.refresh.expires > nowsec)
          {
            await this.refreshToken();
            if(!!this.token)
              return this.token;
          }
          await this.cache.hdel("gamechanger_tokens", this.email).catch();
        }
      } else return at ?? this.token;
    }
    return this.token;
  }
  async startAuth() {
    if(!this.deviceId) await this.generateDeviceIdIfNeeded();
    console.log(`Restarting auth for ${this.deviceId}`, {token:this.token});
    this.token = await this.fetchApi({type:"client-auth",client_id:this.clientId});
    let challenge = await this.fetchApi({type:"user-auth",email:this.email});
    let access_token = false;
    if(challenge?.type == "user-action-required" && this.code) {
      challenge = await this.fetchApi({type:"mfa-code",code:this.code});
      console.log(`MFA response`, JSON.stringify(challenge));
    }
    if(challenge?.type=="password-required")
    {
      let password = this.password;
      if(challenge.password_params?.salt)
        password = bcrypt.hashSync(password, challenge.password_params.salt);
      if(challenge.challenge_params?.salt)
        password = bcrypt.hashSync(password, challenge.challenge_params.salt);
      access_token = await this.fetchApi({type:"password",password:password});
    } else if(challenge?.type=="user-action-required"&&challenge?.kind=="mfa") {
      await this.cache.hset('gamechanger', `${this.email}_sigtoken`, [this.lastSignature,this.token]);
      return this.token = "mfa";
    } else {
      console.warn("Unknown user-auth type", challenge);
    }
    if(access_token?.access?.data)
    {
      await this.storeToken(access_token);
    }
  }
  async videoStreamApi(teamId, gameId) {
    return this.getApi(`teams/${teamId}/schedule/events/${gameId}/video-stream/`, true);
  }
  async teamPlayersApi(teamId) {
    let players = await this.getApi(`teams/${teamId}/players`,true)
      .then((players)=>players?.length&&players.filter((p)=>p.status=="active"));
    if(!Array.isArray(players)||!players.length)
    {
      if(this.proxies&&this.proxies[teamId])
        players = await this.getApi(`teams/${this.proxies[teamId]}/players`);
    }
    if(players.length)
    {
      this.createNameTemplate(players);
    }
    return players;
  }
  async teamUpdatesApi(teamId) {
    return this.getApi(`sync-topics/teams/${teamId}/updates`,true);
  }
  async loadPlayers(team)
  {
    // console.log("loading players", team);
    if(typeof(team)=="string")
    {
      if(!this.players[team])
        await this.teamPlayersApi(team).then((players)=>{
          if(Array.isArray(players)&&players.length&&!players[0].id&&players[0].length&&players[0][0].id)
            players = players[0];
          if(!Array.isArray(players)) return false;
          return this.players[team] = players;
        });
      return this.players[team];
    } else if(Array.isArray(team))
      return team;
    else if(team.id)
    {
      if(!team.name)
      {
        await this.getApi(`teams/${team.id}`)
          .then((out)=>{
            if(typeof(out)=="object"&&out.name)
              team = {...team,...out};
          });
      }
      if(!Array.isArray(team.players)||!team.players?.length)
      {
        team.players = await this.loadPlayers(team.id);
        if(team.name_template = this.createNameTemplate(team.players))
          team.players.forEach((p)=>p.name=team.name_template.function.call(p,p));
      }
      await this.storeTeamData(team);
      return team;
    }
  }
  findData(type,id) {
    let result = false;
    if(type=="player")
    {
      if(!!this.players)
      {
        if(this.players[id]) return this.players[id];
        Object.values(this.players).forEach((team)=>{
          if(team?.length)
            for(var pi=0;pi<team.length;pi++)
              if(team[pi].id==id)
                result = team[pi];
        });
      }
      if(this.teams?.length)
        Object.values(this.teams).forEach((team)=>{
          if(team?.players?.length)
            [...team.players].forEach((p)=>{
              if(p.id==id)
                result = p;
            });
        });
      if(!result&&this.games?.length)
        [...this.games].forEach((game)=>{
          if(game?.teams?.length)
            game.teams.forEach((t)=>{
              if(t?.players?.length)
                [...t.players].forEach((p)=>{
                  if(p.id==id)
                    result = p;
                });
            });
        });
    }
    if(type=="team")
    {
      if(!!this.teams) {
        // if(!!this.teams[id]) return this.teams[id];
        Object.values(this.teams).forEach((team)=>{
          if(team.name&&team.id===id) {
            result = team;
            console.log("Found team", team);
          }
        });
        if(!result&&this.games?.length)
          [...this.games].forEach((game)=>{
            if(game?.teams?.length)
              game.teams.forEach((t)=>{
                if(t.name && t.id==id)
                  result = t;
              });
          })
        if(!result) console.warn(`Bad teams? ${id}`, this.teams);
      }
    }
    if(!!result)
      return result;
    return id;
  }
  /**
   * 
   * @param {*} game_id 
   * @returns Game
   */
  async loadGame(game_id)
  {
    const event = await this.getApi(`events/${game_id}`,true);
    const team_id = event.team_id;
    const summary = await this.getApi(`teams/${team_id}/game-summaries/${game_id}`);
    let team = {};
    if(this.teams[team_id])
      team = new this.teams[team_id];
    else {
      team = new Team(await this.getApi(`teams/${team_id}`));
      this.teams[team_id] = team;
    }
    await this.loadPlayers(team);
    const game = new Game(summary, this.findData, team);
    game.event = event;
    game.setMyTeam(team);
    if(game?.game_stream?.opponent_id&&!game.hasOtherTeam())
    {
      const oppo = {id:game.game_stream.opponent_id};
      if(game.event?.pregame_data?.opponent_name)
        oppo.name = game.event.pregame_data.opponent_name;
      await this.loadPlayers(oppo);
      game.setOtherTeam(oppo);
    }
    if(game?.game_stream?.id)
    {
      await this.loadGameStreamEvents(game.game_stream.id).then((plays)=>game.processGame(plays));
    }
    this.games.push(game);
    return game;
  }
  async loadGameData(game, team)
  {
    if(!game.id&&game.event_id)
      game.id = game.event_id;
    if(team?.id)
    {
      const publicId = team.public_id;
      // await this.getApi(`teams/${team.id}/schedule/events/${game.event_id}/scorekeeping-data/bats`);
      // await this.getApi(`/events/${game.event_id}/best-game-stream-id`);
      // await this.getApi(`/game-streams/gamestream-viewer-payload-lite/${game.event_id}`);
      // game.video_stream = await this.getApi(`/teams/${team.id}/schedule/events/${game.event_id}/video-stream/refresh`,true,{"Content-Type": "application/vnd.gc.com.none+json; version=0.0.0", "Accept": "application/vnd.gc.com.none+json; version=0.0.0"});
      // if(game.video_stream.stream_id)
      // {
      //   await this.getApi(`/game-streams/${vstream.stream_id}`,true);
      //   await this.getApi(`/game-streams/${vstream.stream_id}/events`,true);
      // }
      // await this.getApi(`teams/${team.id}/schedule/events/${game.event_id}/video-stream/assets`,true);
      // await this.getApi(`teams/${team.id}/schedule/events/${game.event_id}/video-stream/assets/playback`,true);
      // if(publicId)
      //   await this.getApi(`public/teams/${publicId}/games/${game.event_id}/details?include=line_scores`,true);
      await this.loadPlayers(team);
      game.setMyTeam(team);
    }
    if(game?.game_stream?.opponent_id&&!game.hasOtherTeam())
    {
      const oppo = {id:game.game_stream.opponent_id};
      if(game.event?.pregame_data?.opponent_name)
        oppo.name = game.event.pregame_data.opponent_name;
      await this.loadPlayers(oppo);

      game.setOtherTeam(oppo);
    }
    // await this.getApi(`teams/${team.id}/schedule/events/${game.event_id}/simple-scorekeeping/game-data`);
    if(game.game_stream?.id) {
      const events = await this.getApi(`game-streams/${game.game_stream.id}/events`,true);
      let plays = [];
      if(events.length)
      {
        plays = [...events];
        for(var pi=0;pi<plays.length;pi++)
          if(typeof plays[pi].event_data == "string")
            plays[pi].event_data = JSON.parse(plays[pi].event_data)
      }
      await this.cache.hget("gc_event_splice", game.event_id).then((splice)=>{
        if(!splice) return; // console.warn(`No splice for ${game.event_id}`);
        // console.log('Splice', splice);
        if(typeof(splice)=="string") splice = JSON.parse(splice);
        if(typeof(splice)=="object"&&splice.code)
          splice = [splice];
        if(Array.isArray(splice))
        [...splice].forEach((event)=>{
          if(event.after_sequence_number)
          {
            const index = plays.findIndex((e)=>e.sequence_number==event.after_sequence_number);
            console.log("Splice!", {event,index});
            if(index>-1)
              plays.splice(index + 1, 0, [{sequence_number:index,...event}]);
          } else if(event.modify_id) {
            let found = false;
            plays.forEach((e)=>{
              if(found) return;
              if(e.id==event.modify_id) {
                found = e;
              } else if(e.event_data?.events) {
                e.event_data.events.forEach((ce)=>{
                  if(ce.id==event.modify_id)
                  {
                    found = ce;
                  }
                });
              }
            });
            if(!found) return console.warn(`Could not find event ${event.modify_id} to modify`);
            if(event.attributes?.defenders?.length==1)
              if(typeof(event.attributes.defenders[0].error)!="undefined")
                found.attributes.defenders[0].error = event.attributes.defenders[0].error;
            if(event.attributes.playResult)
              found.attributes.playResult = event.attributes.playResult;
            console.log("Merged attributes!", found);
          } else console.warn("Unknown splice event.", event);
        });
      });
      game.processGame(plays);
    }
    if(!game.teams[0].players?.length)
      await this.loadPlayers(game.teams[0]);
    if(!game.teams[1].players?.length)
      await this.loadPlayers(game.teams[1]);
    return game;
  }
  async getOrganizations()
  {
    await this.getApi("me/organizations?").then(async(orgs)=>{
      if(Array.isArray(orgs)&&orgs.length)
      {
        for(var o of orgs)
        {
          let oid = o.id;
          if(o.organization)
            oid = o.organization.id;
          this.organizations[oid] = {id:oid,...o.organization??o};
          await this.getApi(`organizations/${oid}/teams?include=team_avatar_image`)
            .then((oteams)=>{
              if(Array.isArray(oteams))
                this.organizations[oid].teams = [...oteams];
            });
        }
      }
    });
    return this.organizations;
    if(false&&Array.isArray(this.organizations)&&this.organizations.length)
    {
      for(var o of this.organizations)
      {
        let oid = o.id;
        if(o.organization)
          oid = o.organization.id;
        o.teams = await this.getApi(`organizations/${oid}/teams?include=team_avatar_image`,0,{"X-Pagination":true});
        if(o.teams.length)
        {
          if(!this.proxies) this.proxies = {};
          o.teams.forEach((oteam)=>{
            if(oteam.proxy_team_id&&oteam.root_team_id)
              this.proxies[oteam.root_team_id] = oteam.proxy_team_id;
          });
        }
      }
    }
  }
  /**
   * 
   * @param {PlayerStats} stats 
   * @param {*} gameId 
   */
  async storePlayerStats(stats, gameId)
  {
    let player = stats.name;
    const email = this.email;
    let others = await this.cache.hget(`stats_${email}`,player);
    if(typeof(others)=="undefined"||others===null)
      others = {};
    if(typeof(others)=="string")
      others = JSON.parse(others);
    if(typeof(others)!="object")
      others = {};
    const otherGames = Object.keys(others);
    if(!!others.total)
      delete others.total;
    others[gameId] = stats.toJson();
    const out = JSON.stringify(others);
    // console.log(`Storing ${Object.keys(others).length} stats for ${player} on ${gameId}: ${out.length}`);
    await this.cache.hset(`stats_${email}`,player,out);
  }
  async storeGameData(game)
  {
    if(typeof(game)!="object") return false;
    const out = {};
    for(var k of ['id','teams','event_id','event'])
      if(game[k])
        out[k] = game[k];
    let game_id = game.id;
    if(!game_id&&game.event?.id)
      game_id = game.event.id;
    if(game_id)
      await this.cache.hset(`gc_games_${this.email}`,game_id,out).catch();
  }
  async getGameData(gameId)
  {
    if(this.games?.length)
      for(var g of this.games)
        if(typeof(g)=="object"&&g.id==gameId)
          return g;
    return await this.cache.hget(`gc_games_${this.email}`,gameId)
      .then((data)=>{
        if(typeof(data)=="string")
          return JSON.parse(data);
        return data;
      });
  }
  async storeTeamData(team)
  {
    await this.cache.hset(`gc_teams_${this.email}`,team.id,team).catch();
  }
  async getTeamData(teamId)
  {
    if(this.teams?.length)
      for(var t of this.teams)
        if(typeof(t)=="object"&&t.id==teamId)
          return t;
    return await this.cache.hget(`gc_teams_${this.email}`,teamId)
      .then((data)=>{
        if(typeof(data)=="string")
          return JSON.parse(data);
        return data;
      });;
  }
  async storeTeamStats(tstats, teamId, gameId)
  {
    const email = this.email;
    let others = await this.cache.hget(`tstats_${email}`, teamId);
    if(typeof(others)=="undefined"||others===null)
      others = {};
    if(typeof(others)=="string")
      others = JSON.parse(others);
    if(typeof(others)!="object")
      others = {};
    others[gameId] = tstats;
    await this.cache.hset(`tstats_${email}`,teamId,others).catch();
  }
  async getTeams() {
    return new Promise(async(resolve,reject)=>{
      const teams = await this.getApi("me/teams?include=user_team_associations", true);
      if(!teams) return reject('No teams found');
      teams.sort((a,b)=>{
        if(a.created_at&&b.created_at)
        {
          const da = Date.parse(a.created_at);
          const db = Date.parse(b.created_at);
          if(da < db) return 1;
          if(da > db) return -1;
          return 0;
        }
      });
      return resolve(this.teams=[...teams].map((t)=>new Team(t)));
    });
  }
  async loadGameStreamEvents(stream_id)
  {
    return this.getApi(`game-streams/${stream_id}/events`,true).then((plays)=>{
      if(plays.length)
      {
        for(var pi=0;pi<plays.length;pi++)
          if(typeof plays[pi].event_data == "string")
            plays[pi].event_data = JSON.parse(plays[pi].event_data)
        return plays;
      }
      return plays;
    });
  }
  createNameTemplate(players) {
    if(!players.length) return false;
    const ret = {};
    for(var template of ["{first_name}","{last_name}","{first_name} {last_name}","#{number}"])
    {
      const names = [];
      const name_func = (p) => template.replace("{first_name}", p.first_name || "").replace("{last_name}", p.last_name || "").replace("#{number}",p.number?`#${p.number}`:"").trim();
      if(![...players].find((p)=>{
        const name = name_func(p);
        if(name.length==1) return true;
        if(names.indexOf(name)>-1)
          return true;
        names.push(name);
      })) {
        ret.template = template;
        ret.function = name_func;
        break;
      }
    }
    players.forEach((p)=>{
      if(!p.long_name) {
        if(p.number)
          p.long_name = `#${p.number}`;
        else p.long_name = "";
        if(p.first_name)
          p.long_name += ` ${p.first_name}`;
        if(p.last_name)
          p.long_name += ` ${p.last_name}`;
        p.long_name = p.long_name.trim();
      }
      if(!p.full_name)
        p.full_name = `${p.first_name} ${p.last_name}`.trim();
      if(!p.full_name&&p.number)
        p.full_name = `#${p.number}`;
      if(ret.function)
        p.name = ret.function.call(p, p);
    });
    if(!ret.function)
      return false;
    return ret;
  }
  async checkForUpdates() {
    const gc = this;
    return new Promise(async(resolve,reject)=>{
      const promises = [];
      const teams = await this.getTeams();
      teams.forEach((team)=>{
        promises.push(this.getApi(`teams/${team.id}/schedule/?fetch_place_details=true`,team.season_year>=new Date().getFullYear()).then((schedule)=>{
          for(var s of [...schedule])
          {
            this.schedule.push(s);
          }
        }))});
      await Promise.all(promises.splice(0,promises.length));
      gc.schedule.sort(Util.eventSort);
      let checks = 0;
      let updates = 0;
      for(var s of [...gc.schedule])
      {
        const event = s.event;
        if(!event?.id) {
          console.error('Event missing id', event);
          continue;
        }
        let config = await this.cache.hget('gamechanger_config', event.id);
        if(!config) continue;
        if(typeof(config)=="string")
          config = JSON.parse(config);
        checks++;
        if(event.status!="cancelled"&&event.id)
        {
          const game = await this.loadGame(event.id);
          const team_id = game.event?.team_id || game.getMyTeam().id;
          const team = game.getMyTeam();
          let stream_id = game.stream?.id;
          if(!stream_id) stream_id = await this.getApi(`events/${event.id}/best-game-stream-id`).then((sid)=>sid?.game_stream_id);
          let sequence_number = game.events[game.events.length-1].sequence_number;
          if(!!config.positions)
          {
            // P	Evan	Evan	Jason	Jason	Kyle	Kyle
            // C	JD	JD	Evan	Evan	Evan	Evan
            // 1B	Jason	Jonah	Jonah	Jonah	Jason	Jason
            // 2B	Jonah	Angus	JD	JD	Pickle	Turbo
            // 3B	Austin	Austin	Austin	Angus	Angus	Austin
            // SS	Kyle	Kyle	Kyle	Kyle	Jonah	Jonah
            // LF	Turbo	Brody	Timmy	Brody	Timmy	Brody
            // CF	Angus	Timmy	Turbo	Abel	Abel	Angus
            // RF	Pickle	Abel	Pickle	Turbo	Austin	JD
            if(typeof(config.positions)=="string")
              config.positions = `${config.positions}`.split("\n").map((row)=>{let cols=row.split("\t");if(cols.length>=6)cols.shift();return cols});
            const players = team.players;
            for(var pos = 0; pos<config.positions.length; pos++)
            {
              if(!config.positions[pos]) continue;
              for(var inning = 0; inning < 6; inning++)
              {
                if(!config.lineup[pos][inning]) continue;
                const name = config.positions[pos][inning];
                if(!config.lineupdates[inning])
                  config.lineupdates[inning] = {};
                const player = players.find((p)=>p.first_name==name);
                if(player.id)
                  config.lineupdates[inning][game.positionCodes[pos]] = player.id;
              }
            }
          } else if(config.lineup)
          {
            // Jonah	2B	1B	1B	1B	SS	SS
            // Angus	CF	2B	X	3B	3B	CF
            // Kyle	SS	SS	SS	SS	P	P
            // Jason	1B	X	P	P	1B	1B
            // Turbo	LF	X	CF	RF	X	2B
            // Evan	P	P	C	C	C	C
            // JD	C	C	2B	2B	X	RF
            // Pickle	RF	X	RF	X	2B	X
            // Brody	X	LF	X	LF	X	LF
            // Austin	3B	3B	3B	X	RF	3B
            // Abel	X	RF	X	CF	CF	X
            // Timmy	X	CF	LF	X	LF	X
            if(typeof(config.lineup)=="string")
              config.lineup = `${config.lineup}`.split("\n").map((row)=>row.split("\t"));
            const players = team.players;
            for(var row of config.lineup)
            {
              const name = row[0];
              const player = players.find((p)=>p.first_name==name||`${p.first_name} ${p.last_name}`==name);
              if(!player?.id)
              {
                console.warn(`Unable to find player for lineup conversion: ${name}`);
                continue;
              }
              for(var inning=1;inning<row.length;inning++)
              {
                const pos = row[inning];
                if(game.positionCodes.indexOf(pos)==-1)
                  continue;
                config.lineupdates[inning-1][pos] = player.id;
              }
            }
          }
          if(config?.oppoline)
          {
            if(typeof(config.oppoline)=="string"&&config.oppoline.length>2)
              config.oppoline = `${config.lineup}`.replaceAll("\r","").split("\n").map((row)=>row.split("\t"));
          }
          if(config?.lineupdates)
          {
            if(config.lineupdates[game.inning]&&typeof(config.lineupdates[game.inning])=="object")
            {
              const update = config.lineupdates[game.inning];
              if(!update.done&&update.positions&&typeof(update.positions)=="object")
              {
                const positions = Object.keys(update.positions);
                for(var pos of positions)
                {
                  await this.sendStreamEvent(stream_id, ++sequence_number,
                    this.buildStreamEventFillPosition(pos, team_id, update.positions[pos]));
                }
                updates += positions.length;
                config.lineupdates[game.inning].done = new Date();
                await this.cache.hset('gamechanger_config', event.id, config).catch();
              }
            } else console.log(`Game ${event.id} inning ${game.inning} had no updates`, config);
          } else console.log(`Game ${event.id} inning ${game.inning} had no line updates`, config);
        }
      }
      resolve({checks,updates});
    });
  }
  async loadData() {
    await this.getToken();
    this.user = await this.getApi("me/user", true);
    await this.getOrganizations();
    if(!this.user.id) return false;
    this.games = [];
    this.teams = {};
    const gc = this;
    const promises = [];
    const teams = await this.getTeams();
    for(var index=0;index<teams.length;index++)
    {
      const team_id = teams[index].id;
      const team = new Team(teams[index]);
      if(team.organizations?.length)
        if(team.organizations.forEach((org)=>{
          if(this.organizations[org.organization_id]) return;
          const oid = org.organization_id;
          this.organizations[oid] = {id:oid,name:"",teams:[]};
          promises.push(this.getApi(`organizations/${oid}`).then((aorg)=>{
            if(aorg.id)
            {
              gc.organizations[aorg.id] = aorg;
            } else console.warn(`Bad Org`, aorg);
            promises.push(this.getApi(`organizations/${oid}/teams?include=team_avatar_image`,false,{"X-Pagination":"true"}).then((oteams)=>{
              if(!oteams) return;
              if(!Array.isArray(oteams)) return;
              gc.organizations[oid].teams = [...oteams];
            }));
          }));
        }));
      gc.teams[team_id] = team;
      promises.push(this.getApi(`teams/${team_id}/schedule/?fetch_place_details=true`,team.season_year>=new Date().getFullYear()).then((schedule)=>{
        if(gc.teams[team_id])
          gc.teams[team_id].schedule = [];
        for(var s of schedule)
        {
          if(s.event?.status!="canceled")
          {
            gc.schedule.push(s);
            if(gc.teams[team_id])
              gc.teams[team_id].schedule.push(s);
          }
        }
      }));
    }
    await Promise.all(promises).catch((reason)=>console.log(`Bad promises!`, reason));
    promises.splice(0,promises.length);
    gc.schedule.sort(Util.eventSort);
    for(var index=0;index<teams.length;index++)
    {
      const team_id = teams[index].id;
      const team = new Team(teams[index]);
      promises.push(this.getApi(`teams/${team_id}/game-summaries`,true).then((games)=>{
        if(games.length)
          for(var gi=0;gi<games.length;gi++)
          {
            const game = new Game(games[gi],this.findData,this.teams[team_id]);
            game.event = this.teams[team_id].schedule?.find((rec)=>rec.event?.id==game.id);
            // if(game.event_id)
            //   game.event = await this.getApi(`events/${game.event_id}`);
            // if(game.game_status==="live"&&game.game_stream?.id)
            // {
            //   await this.loadGameData(game, team);
            // } else if(game.game_status!=="completed")
            //   console.warn(`Other status: ${game.game_status}`);
            game.setMyTeam(team);
            const oppo = {};
            if(game.event?.pregame_data?.opponent_name)
            {
              oppo.id = game.event.pregame_data.opponent_id;
              oppo.name = game.event.pregame_data.opponent_name;
            } else console.warn("no oppo?", game.event);
            if(game.event_stream?.opponent_id)
              oppo.id = game.event_stream.opponent_id;
            if(oppo.id)
            {
              // oppo.players = await this.getApi(`teams/${oppo.id}/players`);
              // console.log("Oppo", oppo);
              game.setOtherTeam(oppo);
            }
            if(!game.teams[0].id)
              game.teams[0] = {id:team.id, name:team.name, players:team.players};
            else if(!game.teams[1].id)
              game.teams[1] = {id:team.id, name:team.name, players:team.players};
            if(!game.getMyTeam().name&&gc.team?.name)
              game.setMyTeam(gc.team);
            this.teams[team_id].addGame(game);
            this.games.push(game);
          }
        }));
    }
    await Promise.all(promises).catch((reason)=>console.log(`Bad promises!`, reason));
    this.games.sort(Util.eventSort);
  }
  async handleReq(req,res) {
    const gc = this;
    let out = false;
    var team = false;
    const promises = [];
    if(req.query?.org)
    {
      const info = await this.getApi(`organizations/${req.query.org}?`);
      const teams = await this.getApi(`organizations/${req.query.org}/teams?include=team_avatar_image`,false,{"X-Pagination":"true"});
      if(teams.length)
        for(var t of teams)
        {
          if(!t.id&&t.root_team_id)
            t.id = t.root_team_id;
          if(!t.id){
            console.warn(`Bad team`, t);
            continue;
          }
          const team = new Team(t);
          this.teams[team.id] = team;
          this.teams[team.id].games = [];
          promises.push(this.getApi(`teams/${team.id}/schedule/?fetch_place_details=true`)
            .then((schedule)=>this.teams[team.id].schedule = schedule));
        }
      if(false&&games?.length)
        for(var game of games)
        {
          if(game.initial_home_team.proxy_team_id)
            promises.push(this.getApi(`teams/${game.initial_home_team.proxy_team_id}/`)
              .then((pteam)=>console.log(`Pteam: ${JSON.stringify(pteam)}`)));
        }
      await Promise.all(promises);

      const games = await this.getApi(`organizations/${req.query.org}/events`)
        .then((games)=>{
          if(games.length)
            games.forEach((g)=>{
              if(g.initial_home_team?.team_id&&this.teams[g.initial_home_team.team_id])
                gc.teams[g.initial_home_team.team_id].games.push(g);
              if(g.initial_away_team?.team_id&&this.teams[g.initial_away_team.team_id])
                gc.teams[g.initial_away_team.team_id].games.push(g);
            });
        });
      out = {info,games,teams:this.teams};
      if(req.query?.team)
      {
        out.players = this.players = await this.teamPlayersApi(req.query.team);
      }
      out.requests = this.requests;
      if(req.query.format=="json")
        return res.send(out);
    }
    if(req.query?.team)
    {
      const team_id = req.query.team;
      if(req.query.proxy) this.link_suffix = `&proxy=${req.query.proxy}`;
      if(team_id.length==36)
      {
        await this.getApi(`teams/${team_id}`).then((t)=>typeof(t)=="object"&&(this.teams[team_id]=new Team(t)));
        if(!this.teams[team_id]&&req.query.root_team_id)
          await this.getApi(`teams/${req.query.root_team_id}`).then((t)=>typeof(t)=="object"&&(this.teams[team_id]=new Team(t)));
        const team = this.teams[team_id];
        team.players = await this.teamPlayersApi(req.query.proxy??team_id);
        team.schedule = await this.getApi(`teams/${team_id}/schedule/?fetch_place_details=true`,true)
          .then((s)=>[...s]
            //.filter((s)=>s.event?.start?.datetime&&new Date(s.event.start.datetime)>Date.now())
            .sort(Util.eventSort)
            .map((s)=>{gc.schedule.push(s);return s;})
          );
        promises.push(this.getApi(`teams/${team_id}/game-summaries`,true).then((games)=>{
          if(games.length)
            for(var gi=0;gi<games.length;gi++)
            {
              const game = new Game(games[gi],this.findData,this.teams[team_id]);
              game.event = gc.schedule.find((rec)=>rec.event?.id==game.id);
              // if(game.event_id)
              //   game.event = await this.getApi(`events/${game.event_id}`);
              // if(game.game_status==="live"&&game.game_stream?.id)
              // {
              //   await this.loadGameData(game, team);
              // } else if(game.game_status!=="completed")
              //   console.warn(`Other status: ${game.game_status}`);
              game.setMyTeam(team);
              const oppo = {};
              if(game.event?.pregame_data?.opponent_name)
              {
                oppo.id = game.event.pregame_data.opponent_id;
                oppo.name = game.event.pregame_data.opponent_name;
              } else console.warn("no oppo?", game.event);
              if(game.event_stream?.opponent_id)
                oppo.id = game.event_stream.opponent_id;
              if(oppo.id)
              {
                // oppo.players = await this.getApi(`teams/${oppo.id}/players`);
                // console.log("Oppo", oppo);
                game.setOtherTeam(oppo);
              }
              if(!game.teams[0].id)
                game.teams[0] = {id:team.id, name:team.name, players:team.players};
              else if(!game.teams[1].id)
                game.teams[1] = {id:team.id, name:team.name, players:team.players};
              this.teams[team_id].addGame(game);
              this.games.push(game);
            }
        }));
        await Promise.all(promises);
        out = true;
        if(req.query.format=="json")
          return res.send({team});
      } else {
        const team = await this.getApi(`public/teams/${teamId}`);
        const players = await this.getApi(`teams/public/${teamId}/players`);
        const games = await this.getApi(`public/teams/${teamId}/games`);
        return res.send({team,players,games,requests:this.requests});
      }
    }
    if(req.query?.filter)
    {
      const filter = `${req.query.filter}`.toLowerCase();
      const schedule = this.schedule = await this.getApi(`me/schedule`, true).then((s)=>s?.schedule?s.schedule:s);
      let filtered = [];
      if(schedule?.events?.length)
        filtered = [...schedule.events].filter((e)=>{
          return JSON.stringify(e).toLowerCase().indexOf(filter)>-1;
        });
      if(req.query.kind)
        filtered = filtered.filter((e)=>e.kind==req.query.kind);
      if(req.query.incomplete)
        filtered = filtered.filter((e)=>!e.scoring||e.scoring.state!="completed");
      for(var i=0;i<filtered.length;i++)
      {
        const e = filtered[i];
        e.video_stream = await this.videoStreamApi(e.team_id, e.id).then((s)=>typeof(s)=="object"?s:{"error":s});
      }
      if(req.query.publishable)
        filtered = filtered.filter((e)=>e.video_stream?.publish_url);
      return res.send({filtered,filter});
    }
    if(req.query?.event)
    {
      const event_id = req.query.event;
      const edata = await this.getApi(`events/${event_id}`,true);
      if(edata.event)
      {
        const event = edata.event;
        await this.cache.hget('gamechanger_config', event_id).then((config)=>{
          if(!config) return;
          if(typeof(config)=="string")
            edata.config = JSON.parse(config);
          if(typeof(config)=="object")
            edata.config = config;
        });
        if(event.team_id)
        {
          edata.team = await this.getApi(`teams/${event.team_id}`);
          edata.team.players = await this.teamPlayersApi(event.team_id);
          if(edata.name_template = this.createNameTemplate(edata.team.players))
            edata.team.players.forEach((p)=>p.name=edata.name_template.function.call(p,p));
          edata.videos = await this.getFullEventVideos(event.team_id, event.id);
          edata.rsvp = await this.getApi(`teams/${event.team_id}/schedule/events/${event_id}/rsvp-responses`, true)
            .then((rsvp)=>{
              if(!rsvp.length) return false;
              const long = rsvp.map((r)=>{
              const player = edata.team.players.find((p)=>p.player_id==r.attending_id||p.id==r.attending_id);
              r.status = r.attending_status;
              if(player?.name)
                r.name = player.name;
              else if(player?.first_name)
                r.name = player.first_name;
              return r;
              });
              const short = {yes:[],no:[],unknown:[]};
              long.filter((r)=>r.name).forEach((r)=>{
                if(r.status=="going"){short.yes.push(r.name);}else{short.no.push(r.name);};
              });
              edata.team.players.forEach((p)=>{
                if(p.name&&short.yes.indexOf(p.name)==-1&&short.no.indexOf(p.name)==-1)
                {
                  short.unknown.push(p.name);
                  long.push({attending_id:p.id||p.player_id,name:p.name,attending_status:"unknown"});
                }
                else if(p.first_name&&short.yes.indexOf(p.first_name)==-1&&short.no.indexOf(p.first_name)==-1)
                  short.unknown.push(p.first_name);
              });
              const names = long.reduce((out,r)=>{
                if(r.attending_status == "going")
                  out[r.name] = "yes";
                else if(r.attending_status != "unknown")
                  out[r.name] = "no";
                else out[r.name] = r.attending_status;
                return out;
              },{});
              return {short,names,long};
            });
        }
        if(edata.pregame_data?.opponent_id)
          await this.teamPlayersApi(edata.pregame_data.opponent_id).then((players)=>{
            edata.opponent = new Team({id:edata.pregame_data.opponent_id,name:edata.pregame_data.opponent_name,players:players.length?players:[]});
          });
        if(edata.pregame_data?.lineup_id)
          edata.lineup = await this.getApi(`bats-starting-lineups/${edata.pregame_data.lineup_id}`)
            .then((lineup)=>{
              if(lineup?.entries)
                return lineup.entries.map((entry)=>{
                  entry.position = entry.fielding_position;
                  entry.player = edata.team.players.find((p)=>p.id==entry.player_id);
                  return entry;
                });
            });
        if(req.query.video_id&&edata.videos)
        {
          for(var video of edata.videos)
            if(video.id==req.query.video_id)
            {
              return await this.sendVideo(video, res);
            }
        }
        edata.playerVideos = await this.getPlayerEventClips(event.id);
        if(edata.playerVideos?.length)
          for(var pv of [...edata.playerVideos])
          {
            if(pv.clip_metadata_id&&req.query.clip_id==pv.clip_metadata_id)
            {
              return await this.sendVideo(pv, res);
            }
            if(pv.player_metadata?.player_id)
            {
              pv.player = edata.team.players.find((p)=>p.id==pv.player_metadata.player_id);
            }
          }

        const game = new Game(edata.event, false, edata.team);
        game.video_stream = game.video_stream = await this.videoStreamApi(edata.team.id, event_id).then((r)=>{if(r=="Not Found")return{"error":"Not Found"};else return r;});
        game.setMyTeam(edata.team);
        if(edata.opponent)
          game.setOtherTeam(edata.opponent);
        await this.getApi(`game-streams/gamestream-viewer-payload-lite/${event.id}`,true).then((paylite)=>{
          if(paylite.latest_events)
            game.processGame(paylite.latest_events.map((e)=>{
              if(typeof(e.event_data)=="string")
                e.event_data = JSON.parse(e.event_data);
              return e;
            }))
          if(paylite.stream_id)
            edata.stream = {id: paylite.stream_id};
        });
        if(edata.stream?.id)
           edata.stream = await this.getApi(`game-streams/${edata.stream.id}`);
        if(game.teams.length>1)
          for(var ti=0;ti<2;ti++)
          {
            let t = game.teams[ti];
            if(typeof(t)=="string") // id
              t = await this.loadPlayers({id:t});
            else if(typeof(t)=="object"&&t.id&&!t.name)
              t = await this.loadPlayers(t);
            else continue;
            if(!edata.opponent&&t?.name)
            {
              edata.opponent = t;
              game.setOtherTeam(t);
            }
          }
        edata.game = game;
        if(req.query?.format=="json")
          return res.send(edata);
        if(req.headers.accept?.indexOf("html")>-1)
          writeMain(res, edata);
        // await this.getApi(`game-streams/gamestream-viewer-payload-lite/${event.id}`,true).then((paylite)=>{
        //   if(paylite.latest_events)
        //     edata.events = paylite.latest_events;
        //   if(paylite.stream_id)
        //     edata.stream_id = paylite.stream_id;
        // });
        // const streamId = await this.getApi(`events/${event.id}/best-game-stream-id`).then((sid)=>sid?.game_stream_id);
        // if(streamId&&(!edata.stream_id||edata.stream_id!=streamId))
        // {
        //   edata.stream = await this.getApi(`game-streams/${streamId}`);
        //   edata.events = await this.getApi(`game-streams/${streamId}/events`,edata.stream?.game_status=="live");
        //   if(edata.stream.game_status=="live")
        //     edata.stream = await this.getApi(`game-streams/${streamId}`,true);
        // }
      }
      if(res.headersSent) return false;
      return res.send(edata);
    }
    if(req.query?.game)
    {
      // await this.getOrganizations();
      const event = await this.getApi(`events/${req.query.game}`,true);

      if(event?.event?.team_id)
      {
        team = new Team(await this.getApi(`teams/${event.event.team_id}`));
        const players = await this.teamPlayersApi(event.event.team_id);
        if(players?.length) team.players = players;
        this.teams[team.id] = team;
      }
      const game = new Game({event},this.findData,team);
      game.video_stream = await this.videoStreamApi(team.id, req.query.game).then((r)=>{if(r=="Not Found")return{"error":"Not Found"};else return r;});
      if(team)
        game.setMyTeam(team);
      if(game.event?.event?.id)
      {
        const summary = await this.getApi(`teams/${game.event.event.team_id}/game-summaries/${game.event.event.id}`,true);
        if(summary.game_stream)
          Object.keys(summary).forEach((key)=>{
            game[key] = summary[key];
          });
      }

      if(req.query.proxy)
        await this.teamPlayersApi(req.query.proxy);

      if(!!game?.event)
      {
        let oppo = {};
        if(game.event?.pregame_data?.opponent_name)
          oppo = {id: game.event.pregame_data.opponent_id, name: game.event.pregame_data.opponent_name};
        else if(game.game_stream?.opponent_id)
        {
          oppo.id = game.game_status.opponent_id;
        }
        let ourId = game.teams.find((t)=>{
          if(typeof(t)=="string"&&t!=oppo.Id)
            return t;
          return false;
        });
        if(!ourId&&game.getMyTeam().id)
          ourId = game.getMyTeam().id;
        oppo = await this.loadPlayers(oppo);
        game.setOtherTeam(oppo);
        await this.loadGameData(game, team);
        if(!Array.isArray(team?.players)||!team?.players?.length)
        {
          if(this.proxies&&this.proxies[team.id])
            team.id = team.proxies[team.id];
          else if(req.query.team)
            team.players = await this.teamPlayersApi(req.query.team);
          console.log(`Fallback to ${team.id}`);
          await this.loadPlayers(team);
          game.setMyTeam(team);
        }
        await this.storeGameData(game);
        this.games.push(game);
        out = this;
      }
    }
    if(!out) {
      await this.loadData();
      out = this;
    }
    if(this.games.length)
      this.games.forEach((game)=>{
        if(game.events?.length&&game.recrunch)
          game.recrunch();
      });
    if(this.games.length==1&&this.games[0].player_stats)
    {
      const game = this.games[0];
      const tstats = {};
      const pstats = game.player_stats;
      const game_id = game.id ?? game.event_id;
      Object.keys(this.players).forEach((teamId)=>{
        const team = this.players[teamId];
        if(!tstats[teamId])
          tstats[teamId] = {};
        team.forEach((player)=>{
          if(!(player.id&&player.first_name)) return;
          if(pstats[player.id])
          {
            pstats[player.id].name = `${player.first_name} ${player.last_name}`;
            tstats[teamId][`${player.first_name} ${player.last_name}`] = pstats[player.id];
          } else {
            tstats[teamId][player.id] = pstats[player.id];
          }
        });
      }); 
      // console.log("team stats", tstats);

      for(var pstat of Object.values(pstats))
        await this.storePlayerStats(pstat, game_id);
      for(var teamid of Object.keys(tstats))
      {
        // console.log(`Team store for ${teamid}`, tstats[teamid]);
        await this.storeTeamStats(tstats, teamid, game_id);
      }
      out.stats = pstats;
    }
    if(req.query?.format?.indexOf("json")>-1)
    {
      res.header("Content-Type", "application/json");
      res.send({"organizations":this.organizations,teams:this.teams,"games":this.games,"proxies":this.proxies,players:this.players,events:this.events,requests:this.requests});
    }
    else if(req.headers.accept?.indexOf("html")>-1)
    {
      writeMain(res, gc);
    } else res.send(gc);
  }
  async sendVideo(video,res) {
    let url = video.url;
    //.replace('master.m3u8','480p30/playlist.m3u8');
    const opts = {credentials:"include",headers:{}};
    let suffix = "";
    let prefix = url.substr(0,url.lastIndexOf('/'));
    if(video.cookies)
      suffix = "?" + Object.keys(video.cookies).map((key)=>`${key.replace('CloudFront-','')}=${encodeURIComponent(video.cookies[key])}`).join('&');
    url += suffix;
    // console.log(`Request-Headers for ${url}`, JSON.stringify(opts.headers));
    await fetch(url, opts)
      .then((r)=>{
        if(r.headers)
          r.headers.forEach((val,key)=>{
            if(key.toLowerCase().indexOf("length")==-1)
              res.header(key, val);
          });
        return r.text();
      })
      .then((blob)=>{
        res.send(blob.split("\n").map((s)=>{
          if(s.startsWith("#")) return s;
          return new URL(s.replace('../','') + suffix, prefix).toString();
        }).join("\n")+"\n");
      });
  }

}
module.exports = {GameChanger:gamechanger};
const CryptoJS = require("crypto-js");
const bcrypt = require("bcrypt");
const fetch = require('node-fetch');
const { ScoreBooks, ScoreBook, ScoreInning, ScoreBlock } = require('./scorebook');
const { Baseball, Game, Team } = require("./baseball");
const Util = require("./util");
const { PlayerStats, PlayerStatTitles } = require("./PlayerStats");
const { writeEventHTML, writeScorebook, writeScripts } = require('./html_generator');

class gamechanger {
  constructor(email,password,cache) {
    this.email = email;
    this.password = password;
    this.requests = [];
    this.clientId = "c66bec0d-0664-4802-be6d-07ad063cf120";
    this.signKey = "Xoz8wTJ46Q2+Eh/Ql90Bdnyfo/pJpJbNH8tDxcU95PY=";
    this.lastSignature = false;
    this.token = false;
    this.cache = cache;
    this.players = {};
    this.teams = {};
    this.games = [];
    this.organizations = [];
    this.proxies = {};
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
  async fetchApi(post, action, oheaders) {
    if(!action) action = "auth";
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
      "gc-device-id": "202072e26b3f013628839d4fef57e47c"
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
    if(!!oheaders)
      Object.keys(oheaders).forEach((key)=>{
        headers[key] = oheaders[key];
      });
    // if(action != "auth")
    //   headers['accept'] = 'application/vnd.gc.com.user+json; version=0.1.0';
    const method = post ? "POST" : "GET";
    const opts = {headers,method,mode:"cors"};
    if(post) opts.body = JSON.stringify(post);
    const rheaders = {};
    console.log(action);
    const result = await fetch("https://api.team-manager.gc.com/"+action, opts)
      .then((r)=>{
        if(!r.ok&&r.headers)
          r.headers.forEach((val,key)=>rheaders[key]=val);
        let isJson = false;
        if(r.headers.has("content-type")&&r.headers.get("content-type").indexOf("json")>-1)
          isJson = true;
        if(r.headers.has("gc-signature"))
          this.lastSignature = r.headers.get("gc-signature").split(".")[1];
        if(isJson) return r.json();
        return r.text();
      });
    
    this.requests.push({request:action,post,response:result,headers:rheaders});
    return result;
  }
  async sendStreamEvent(stream_id,sequence_number,data)
  {
    const game_stream_event = {
      id:Util.uuid(),
      stream_id,
      sequence_number,
      event_data:JSON.stringify({
        id:Util.uuid(),
        createdAt:Date.now(),
        ...data
        })};
    return this.fetchApi({game_stream_event},'game-stream-events');
  }
  async getApi(action,nocache,headers)
  {
    return new Promise(async(resolve,reject)=>{
      let data = false;
      if(!!this.cache?.client&&!nocache)
      {
        data = await this.cache.hget("gamechanger", action + (action.indexOf("me/")>-1 ? this.email : "")).catch();
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
          this.requests.push({request:action + (action.indexOf("me/")>-1 ? this.email : ""),cache_response:data});
          return resolve(data);
        }
      }
      data = await this.fetchApi(false, action, headers);
      if(!!this.cache&&!nocache&&!!data&&!!this.cache.client)
      {
        await this.cache.hset("gamechanger", action + (action.indexOf("me/")>-1 ? this.email : ""), JSON.stringify(data)).catch();
      }
      return resolve(data);
    });
  }
  async storeToken(access_token)
  {
    this.token = access_token;
    if(!!this.cache)
      await this.cache.hset("gamechanger", this.email + "_access_token", access_token).catch();
    else {
      console.warn("No cache for GC");
      return false;
    }
  }
  async refreshToken()
  {
    const access_token = await this.fetchApi({type:"refresh"});
    if(access_token?.type=="token")
    {
      access_token.access.expiry = new Date(access_token.access.expires*1000);
      access_token.refresh.expiry = new Date(access_token.refresh.expires*1000);
      if(!!this.cache?.client)
	      await this.cache.hset("gamechanger", this.email + "_access_token", JSON.stringify(access_token)).catch();
      this.token = access_token;
      return this.token;
    }
  }
  async getToken()
  {
    if(this.token?.access?.data)
      if(this.token.access.expires * 1000 > Date.now())
        return this.token;
    if(!!this.cache)
    {
      const at = await this.cache.hget("gamechanger", this.email + "_access_token");
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
          await this.cache.hdel("gamechanger", this.email + "_access_token").catch();
        }
      } else return at;
    }
    return false;
  }
  async startAuth() {
    console.log("Restarting auth");
    this.token = await this.fetchApi({type:"client-auth",client_id:this.clientId});
    const challenge = await this.fetchApi({type:"user-auth",email:this.email});
    let access_token = false;
    if(challenge?.type == "user-action-required" && this.code) {
      challenge = await this.fetchApi({type:"mfa-code",code:this.code});
    }
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
      access_token.access.expiry = new Date(access_token.access.expires*1000);
      access_token.refresh.expiry = new Date(access_token.refresh.expires*1000);
      this.storeToken(access_token);
    }
  }
  async videoStreamApi(teamId, gameId) {
    return this.getApi(`teams/${teamId}/schedule/events/${gameId}/video-stream/`);
  }
  async teamPlayersApi(teamId) {
    let players = this.getApi(`teams/${teamId}/players`);
    if(!Array.isArray(players)||!players.length)
    {
      if(this.proxies&&this.proxies[teamId])
        players = this.getApi(`teams/${this.proxies[teamId]}/players`);
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
        team.name = await this.getApi(`teams/${team.id}`)
          .then((out)=>out.name);
      }
      if(!Array.isArray(team.players)||!team.players?.length)
        team.players = await this.loadPlayers(team.id);
      await this.storeTeamData(team);
      return team;
    }
  }
  findData(type,id) {
    let result = false;
    if(type=="player"&&!!this.players)
    {
      Object.values(this.players).forEach((team)=>{
        if(team?.length)
          for(var pi=0;pi<team.length;pi++)
            if(team[pi].id==id)
              result = team[pi];
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
        if(!result) console.warn(`Bad teams? ${id}`, this.teams);
      }
    }
    if(!!result)
      return result;
    return id;
  }
  async loadGameData(game, team)
  {
    if(!game.id&&game.event_id)
      game.id = game.event_id;
    if(team?.id)
    {
      await this.getApi(`teams/${team.id}/schedule/events/${game.event_id}/scorekeeping-data/bats`);
      await this.getApi(`teams/${team.id}/schedule/events/${game.event_id}/video-stream/`);
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
  }
  async getOrganizations()
  {
    this.organizations = await this.getApi("me/organizations?");
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
    await this.cache.hset(`gc_games_${this.email}`,game.id,out);
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
    await this.cache.hset(`gc_teams_${this.email}`,team.id,team);
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
    await this.cache.hset(`tstats_${email}`,teamId,others);
  }
  async loadData() {
    await this.getToken();
    this.user = await this.getApi("me/user", true);
    await this.getOrganizations();
    if(!this.user.id) return false;
    this.games = [];
    this.teams = {};
    const promises = [];
    const teams = await this.getApi("me/teams?include=user_team_associations", true);
    if(!teams) return false;
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
    for(var index=0;index<teams.length;index++)
    {
      const team_id = teams[index].id;
      const team = new Team(teams[index]);
      this.teams[team_id] = team;
      promises.push(this.getApi(`teams/${team_id}/schedule/?fetch_place_details=true`,true).then((schedule)=>{
        this.teams[team_id].schedule = schedule;
      }));
    }
    await Promise.all(promises);
    promises.splice(0,promises.length);
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
            this.teams[team_id].addGame(game);
            this.games.push(game);
          }
        }));
    }
    await Promise.all(promises);
    this.games.sort((a,b)=>{
      if(a.event?.event?.start?.datetime&&b.event?.event?.start?.datetime)
      {
        const da = Date.parse(a.event.event.start.datetime);
        const db = Date.parse(b.event.event.start.datetime);
        if(da<db) return 1;
        if(da>db) return -1;
        return 0;
      }
    });
  }
  async handleReq(req,res) {
    const gc = this;
    let out = false;
    var team = false;
    if(req.query?.org)
    {
      const info = await this.getApi(`organizations/${req.query.org}?`);
      const games = await this.getApi(`organizations/${req.query.org}/events`);
      const teams = await this.getApi(`organizations/${req.query.org}/teams?include=team_avatar_image`,false,{"X-Pagination":"true"});
      if(teams.length)
        teams.forEach((team)=>{
          this.teams[team.id] = team;
        });
      if(this.games.length)
        this.games.forEach((game)=>{
            this.getApi(`teams/${game.initial_home_team.proxy_team_id}/`);
        });
      out = {info,games,teams};
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
      const team = await this.getApi(`public/teams/${req.query.team}`);
      const players = await this.getApi(`teams/public/${req.query.team}/players`);
      const games = await this.getApi(`public/teams/${req.query.team}/games`);
      return res.send({team,players,games,requests:this.requests});
    }
    if(req.query?.game)
    {
      await this.getOrganizations();
      const event = await this.getApi(`events/${req.query.game}`,true);
      if(event?.event?.team_id)
      {
        team = new Team(await this.getApi(`teams/${event.event.team_id}`));
        this.teams[team.id] = team;
      }
      const game = new Game({event},this.findData,team);
      if(game.event?.event?.id)
      {
        const summary = await this.getApi(`teams/${game.event.event.team_id}/game-summaries/${game.event.event.id}`,true);
        if(summary.game_stream)
          Object.keys(summary).forEach((key)=>{
            game[key] = summary[key];
          });
      }

      if(!!game?.event)
      {
        let oppo = {};
        if(game.event?.pregame_data?.opponent_name)
          oppo = {id: game.event.pregame_data.opponent_id, name: game.event.pregame_data.opponent_name};
        else if(game.game_stream?.opponent_id)
        {
          oppo.id = game.game_status.opponent_id;
        }
        const ourId = game.teams.find((t)=>{
          if(typeof(t)=="string"&&t!=oppo.Id)
            return t;
          return false;
        });
        oppo = await this.loadPlayers(oppo);
        game.setOtherTeam(oppo);
        if(ourId)
        {
          team = {id:ourId};
          await this.loadPlayers(team);
          game.setMyTeam(team);
        }
        await this.loadGameData(game, team);
        if(!Array.isArray(team?.players)||!team?.players?.length)
        {
          if(this.proxies&&this.proxies[team.id])
            team.id = team.proxies[team.id];
          else if(req.query.team)
            team.id = req.query.team;
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
      out = {"stats":out.stats,"games":this.games,"proxies":this.proxies,"organizations":this.organizations,players:this.players,events:this.events,teams:this.teams,requests:this.requests};
      res.send(out);
    }
    else if(req.headers.accept?.indexOf("html")>-1)
    {
      res.header("Content-Type", "text/html");
      res.write(`<html><head><title>`);
      if(gc.games?.length==1)
      {
        const game = gc.games[0];
        const t1 = game.teams[0];
        const t2 = game.teams[1];
        res.write(`${t1.name} (${game.runs[0]}) @ ${t2.name} (${game.runs[1]})`);
      }
      else if(gc.games?.length>1)
        res.write(`GC Games for ${gc.email}`);
      else res.write(gc.email);
      res.write(`</title></head><body><div class="page">`);
      const suffix = req.query.user ? `&user=${req.query.user}` : "";
      if(out.events)
      {
        res.write(`<table border="1">`);
        if(out.teams)
          res.write(`<caption>${out.teams[0].name} @ ${out.teams[1].name}</caption>`);
        out.events.forEach((e)=>writeEventHTML(e,res,gc));
        res.write("</table>");
        writeScorebook(out, res, gc);
      }
      if(gc.games)
      {
        gc.games.forEach((game,gi)=>{
          if(!game.teams) return;
          const t1 = game.teams[0];
          const t2 = game.teams[1];
          if(!game.events?.length) {
            const linkStart = `<a href="?game=${game.event_id}${suffix}">`;
            if(gi==0)
              res.write('<div class="games"><table>');
            res.write('<tr>');
            let matchType = "vs";
            if(game.home_away == "home")
              matchType = "@";
            res.write(`<td>${linkStart}${game.getMyTeam().name} (${game.owning_team_score})</a></td>`);
            res.write(`<td>${matchType}<td>`);
            res.write(`<td>${linkStart}${game.getOtherTeam().name} (${game.opponent_team_score})</a></td>`);
            res.write(`<td>${linkStart}${game.last_scoring_update}</a></td>`);
            res.write('</tr>');
            if(gi==gc.games.length-1) res.write('</table></div>');
            return;
          }
          if(out.events) return;
          res.write(`<div class="noprint"><a href="/">Back to Teams</a></div>`);
          res.write(`<div class="toggleNext"><h1><a href="/stats?team=${t1.id}">${t1.name}</a> (${game.runs[0]}) @ <a href="/stats?team=${t2.id}">${t2.name}</a> (${game.runs[1]}) on ${new Date(game.events[0].createdAt).toDateString()}</h1></div>`);
          res.write(`<table border="1" class="hide">`);
          game.events.forEach((e)=>writeEventHTML(e,res,gc));
          res.write("</table>");
          writeScorebook(game, res, gc);
        });
      }
      writeScripts(res);
      res.write(`<a href="/logout" class="noprint">Log Out</a>`);
      res.write(`</body></html>`);
      res.end();
    } else res.send(gc);
  }

}
module.exports = {GameChanger:gamechanger};
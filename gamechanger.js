const CryptoJS = require("crypto-js");
const bcrypt = require("bcrypt");
const fetch = require('node-fetch');
const { ScoreBooks, ScoreBook, ScoreInning, ScoreBlock } = require('./scorebook');
const { Baseball, Game, Team } = require("./baseball");
const Util = require("./util");
const { PlayerStats, PlayerStatTitles } = require("./PlayerStats");

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
        return e && Object.keys(e).sort().flatMap((t)=>{return this.flatten(e[t]);}) || ["null"];
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
    if(!this.token) await this.getToken();
    if(!action) action = "auth";
    if(action!="auth"&&!this.token)
      await this.startAuth();
    if(action!="auth"&&!this.token) return false;
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
    const rheaders = [];
    console.log(action);
    const result = await fetch("https://api.team-manager.gc.com/"+action, opts)
      .then((r)=>{
        let isJson = false;
        if(r.headers.has("content-type")&&r.headers.get("content-type").indexOf("json")>-1)
          isJson = true;
        if(r.headers.has("gc-signature"))
          this.lastSignature = r.headers.get("gc-signature").split(".")[1];
        if(isJson) return r.json();
        return r.text();
      });
    this.requests.push({request:action,post,response:result});
    return result;
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
    const access_token = this.fetchApi({type:"refresh"});
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
      if(challenge.password_params)
        password = bcrypt.hashSync(password, challenge.password_params.salt);
      if(challenge.challenge_params)
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
      const writeEventHTML = (e) => {
        let r = e.attributes?.result || e.attributes?.playType || "";
        let pr = e.shortResult || e.playResult || e.attributes?.playResult || "";
        const snap = e.snapshot;
        delete e.snapshot;
        let player = e.batterId || "";
        if(e.attributes.runnerId)
          player = e.attributes.runnerId;
        else if(e.attributes.playerId)
          player = e.attributes.playerId;
        if(typeof(player)=="string")
          player = gc.findData("player", player);
        const stamp = e.createdAt ? new Date(e.createdAt).toLocaleTimeString() : "";
        if(!pr)
        {
          if(e.attributes.position) pr = e.attributes.position;
          else if(e.attributes.base) pr = e.attributes.base;
          else if(e.code == 'reorder_lineup') {
            pr = e.attributes.toIndex;
            r = e.attributes.fromIndex;
          }
          else if(typeof(e.attributes.index)!="undefined")
            r = e.attributes.index;
          else if(!!e.pitcherId)
          {
            const pitcher = gc.findData("player", e.pitcherId);
            if(typeof(pitcher)=="object")
              pr = `${pitcher.first_name} ${pitcher.last_name}`;
          }
        }
        if(typeof(player)=="object")
          player = `${player.first_name} ${player.last_name}`;
        const deets = Util.tablify(e);
        res.write(`<tr class="${e.hidden?'hidden':''}"><td>${e.sequence_number}</td>
          <td>${stamp}</td>
          <td>${player}</td>
          <td>${e.code}</td>
          <td>${r}</td>
          <td>${pr}</td>
          <td>${snap}</td>
          <td><div class="float hide">${deets}</div><button class="togglePrev">Show</button></td></tr>`);
      }
      /**
       * 
       * @param {Game} game 
       */
      const writeScorebook = (game) => {
        if(game.scorebooks)
        {
          res.write(`<div class="summary">`);
          const hrow = [''];
          const rows = [[game.teams[0].name],[game.teams[1].name]];
          const total_stats=[{runs:0,hits:0,errors:0},{runs:0,hits:0,errors:0}];
          for(var inning=0;inning<9;inning++)
          {
            hrow.push(inning+1);
            for(var side=0;side<=1;side++)
            {
              if(!game.inning_stats[inning]||!game.inning_stats[inning][side])
              {
                rows[side][inning+1] = "";
                continue;
              }
              for(var stat of ['runs','hits','errors'])
                total_stats[side][stat] += game.inning_stats[inning][side][stat];
              rows[side][inning+1] = game.inning_stats[inning][side].runs;
            }
          }
          hrow.push('R');
          rows[0].push(total_stats[0].runs);
          rows[1].push(total_stats[1].runs);
          hrow.push('H');
          rows[0].push(total_stats[0].hits);
          rows[1].push(total_stats[1].hits);
          hrow.push('E');
          rows[0].push(total_stats[0].errors);
          rows[1].push(total_stats[1].errors);
          res.write(`<table border="1"><thead><tr><td>${hrow.join('</td><td>')}</td></tr></thead><tbody>`);
          for(var side=0;side<=1;side++)
            res.write(`<tr><td class="teamname">${rows[side].join('</td><td>')}</td></tr>`);
          res.write(`</table>`);
          res.write(`</div>`);
          res.write('<button class="noprint toggleNext">Show Stats</button>');
          res.write(`<div class="stats hide">`);
          var stat;
          for(var side=0;side<=1;side++)
          {
            const lineup = [...game.lineup[side]];
            lineup.push(side);
            res.write(this.showStats(game.player_stats, lineup, game));
          }
          res.write(`</div>`);
          res.write(`<div class="scorebook">`);
          for(var side=0;side<=1;side++)
          {
            /** @type ScoreBook */
            const book = game.scorebooks.getBook(side);
            res.write(`<div class="toggleNext breakup">${game.teams[side].name} (${side?"vs":"@"} ${game.teams[1-side].name}) on ${new Date(game.events[0].createdAt).toLocaleDateString()}</div>
              <table class="book" border="1" cellpadding="0" cellspacing="0">
              <thead><tr><td>BO</td><td width="30">#</td><td width="160">Player / POS</td>`);
            book.columns.forEach((col)=>{
              if(!col.plays.find((play)=>play.playType||play.pitches.length)) return;
              res.write(`<td>${col.inning}</td>`);
            });
            res.write("</tr>\n");
            for(var benchPos=0;benchPos<game.lineup[side].length;benchPos++)
            {
              const playerId = game.lineup[side][benchPos];
              var player = game.findPlayer(playerId);
              var found = false;
              if(!player||player==playerId)
              {
                if(game.teams[side].players?.length)
                  found = [...game.teams[side].players].find((p)=>p.id==playerId);
                if(found)
                {
                  player = `${found.first_name} ${found.last_name}`;
                }
              } else if(typeof(player)=="object")
              {
                found = player;
                player = `${player.first_name} ${player.last_name}`;
              }
              res.write(`
                <tr><td>${benchPos+1}</td><td>#${found?.number}</td><td style="padding-right:5px"><a href="/stats?player=${encodeURIComponent(player)}">${player}</a>`);
              let pos = game.inning_positions[0][side][playerId] ?? "EH";
              res.write(`<span style="float:right">${pos}</span>`);
              const ipos = {};
              let haspos = pos != "EH";
              for(var inn=1;inn<game.inning_positions.length;inn++)
              {
                if(!game.inning_positions[inn]) continue;
                if(!game.inning_positions[inn][side]) continue;
                if(game.inning_positions[inn][side][playerId])
                {
                  pos = ipos[inn+1] = game.inning_positions[inn][side][playerId];
                  haspos = true;
                } else if(Object.values(game.inning_positions[inn][side]).indexOf(pos)>-1)
                {
                  pos = ipos[inn+1] = "EH";
                }
              }
              if(haspos)
                res.write(`<table style="clear:right;float:right;" class="subs" cellpadding="2" cellspacing="0" border="1"><tr><td>${Object.keys(ipos).join('</td><td>')}</td></tr>
                  <tr><td>${Object.values(ipos).join('</td><td>')}</td></tr></table><div style="clear:both"></div>`);
              res.write(`</td>`);
              book.columns.forEach((col,colin)=>{
                if(!col.plays.find((play)=>play.playType||play.pitches.length)) return;
                let block = col.plays.find((b)=>b.playerId==playerId&&!b.used);
                if(!block&&colin==0)
                  block = col.plays.find((b)=>b.row==benchPos&&!b.used);
                if(block)
                {
                  block.used = true;
                  if(block.pitcherId)
                  {
                    const pitcher = this.findData("player", block.pitcherId);
                    if(typeof(pitcher)=="object"&&pitcher.first_name)
                      block.pitcher = `${pitcher.first_name} ${pitcher.last_name}`;
                  }
                  else {
                    delete block.pitcherId;
                    delete block.pitcher;
                  }
                }
                if(block?.top)
                  res.write(`<td class="top block">`);
                else
                  res.write(`<td class="block">`);
                if(block?.playType||block?.pitches?.length||block?.offense=="PR")
                {
                  res.write(`<div class="toggleNext">`);
                  res.write(ScoreBooks.getScoreHTML(block));
                  if(block.events?.length)
                    block.events.forEach((e)=>delete e.snapshotJ);
                  res.write(`</div><div class="info hide float noprint"><div class="biggin">${Util.tablify(block)}</div></div>`);
                }
                res.write(`</td>`);
              });
              res.write("</tr>");
            }
            res.write(`</table>`);
          }
          res.write("</div>");
        }
      };
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
        out.events.forEach(writeEventHTML);
        res.write("</table>");
        writeScorebook(out);
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
          game.events.forEach(writeEventHTML);
          res.write("</table>");
          writeScorebook(game);
        });
      }
      this.writeScripts(res);
      res.write(`<a href="/logout" class="noprint">Log Out</a>`);
      res.write(`</body></html>`);
      res.end();
    } else res.send(gc);
  }
  /**
   * 
   * @param {PlayerStats} totalStats 
   */
  showTotalStats(totalStats, allStats, teamId) {

    const out = [];
    if(totalStats?.sprayChart) out.push(this.showSprayChart(totalStats.sprayChart, !!teamId));
    if(allStats)
    {
      const lineup = [];
      const ourLineup = [];
      const player_stats = {};
      for(var gameId in allStats)
      {
        const astat = allStats[gameId];
        if(!teamId)
        {
          if(lineup.indexOf(gameId)==-1)
          {
            lineup.push(gameId);
            player_stats[gameId] = new PlayerStats(astat);
          } else {
            player_stats[gameId].accumulate(astat);
          }
          player_stats[gameId].calculate();
          continue;
        }
        for(var team in astat)
          if(teamId.indexOf(team)>-1)
            for(var playerId in astat[team])
            {
              if(lineup.indexOf(playerId)==-1)
              {
                lineup.push(playerId);
                player_stats[playerId] = new PlayerStats(astat[team][playerId]);
              } else {
                player_stats[playerId].accumulate(astat[team][playerId]);
              }
              player_stats[playerId].calculate();
            }
      }
      if(!teamId)
        lineup.sort((a,b)=>{
          if(allStats[a].game?.event?.event?.start?.datetime)
          {
            return new Date(allStats[a].game?.event?.event?.start?.datetime) < new Date(allStats[b].game?.event?.event?.start?.datetime) ? 1 : -1;
          }
        });
      // console.log("Lineup", lineup);
      out.push('<div class="stats">');
      out.push(this.showStats(player_stats, lineup, allStats));
      out.push('</div>');
      out.push(`<button class="togglePrev noprint">Toggle Stats</button>`);
    }
    return out.join("\n");
  }
  showSprayChart(sprayChart, hideDetails) {
    if(!sprayChart.length) return "";
    const out = [];
    out.push(`<div class="spray">`)
    out.push(`<span class="toggleNext">Spray Chart (${sprayChart.length})</span>`)
    out.push('<div>');
    out.push('<svg style="border:1px solid black;width:100%;max-width:1200px;height:auto;max-height:70vw"  width="162" height="112" viewBox="15 4 63 52" xmlns="http://www.w3.org/2000/svg">');
    out.push(`
    <path style="fill:none;stroke:#333;stroke-width:.264583;stroke-dasharray:1.5875,1.5875;stroke-dashoffset:0" d="m43.572 68.065 15.54-15.542 15.542 15.542-15.541 15.54z" transform="translate(-13 -28.894)"/>
    <path style="fill:none;stroke:#333;stroke-width:.27213;stroke-dasharray:1.63278,1.63278;stroke-dashoffset:0" d="M43.48 67.968 29.637 54.124" transform="translate(-13 -28.894)"/>
    <path style="fill:none;stroke:#333;stroke-width:.274281;stroke-dasharray:1.64569,1.64569;stroke-dashoffset:0" d="M74.654 68.065 88.5 54.22" transform="translate(-13 -28.894)"/>
    <path style="fill:none;stroke:#333;stroke-width:.264583;stroke-dasharray:1.5875,1.5875;stroke-dashoffset:0" d="M29.636 54.124S36.72 33.772 59.052 33.71C82.34 33.646 88.5 54.22 88.5 54.22" transform="translate(-13 -28.894)"/>
    `);
    if(sprayChart.length>20) hideDetails = true;;
    sprayChart.forEach((block)=>{
      let marks = '';
      let stroke = "none";
      let color = "green";
      let thick = 0.1;
      if(block.offsense == "FC") block.defense = "FC";
      if(block.defense)
        color = "red";
      if(block.offense=="FC")
        color = "purple";
      if(block.playType&&block.playType.indexOf('ground')>-1)
        stroke = "0.5,0.25";
      if(block.playType&&(block.playType.indexOf('line')>-1||block.playType.indexOf('hard')>-1))
        thick = 0.2;
      let x2 = (block.location.x-160)/5.5;
      let y2 = (310-block.location.y)/-5.75;
      let line = `m60 85`;
      if(block.playType&&block.playType.indexOf('fly')>-1)
      {
        let dx1 = 6, dx2 = 6;
        let dy1 = -6, dy2 = y2;
        if(block.location.x>160)
        {
          dx1 = dx2 = -6;
        }
        line += `c ${dx1} ${dy1}, ${dx2} ${dy2}`;
      } else 
      if(false&&block.playType&&block.playType.indexOf('line')>-1)
      {
        let dx1 = 0.1, dx2 = 0.1;
        let dy1 = -0.1, dy2 = y2+16;
        if(block.location.x>160)
        {
          dx1 = dx2 = -1;
        }
        line += `c ${dx1} ${dy1}, ${dx2} ${dy2}`;
      }
      if(!isNaN(x2)&&!isNaN(y2))
      {
        line += ` ${x2} ${y2}`;
        marks += `<circle r="1" cx="${60+x2}" cy="${85+y2}" style="fill:none;stroke-width:${thick};stroke-dasharray:${stroke};stroke:${color}" transform="translate(-13.749 -30.811)"/>`;
        if(!hideDetails)
        {
          marks += `<path style="fill:none;stroke:${color};stroke-width:${thick};stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:${stroke};stroke-dashoffset:0;stroke-opacity:1" d="${line}" transform="translate(-13.749 -30.811)"/>`;
          if(block.offense&&block.offense!="1B")
            marks += `<text xml:space="preserve" x="${61+x2}" y="${86+y2}" transform="translate(-13.749 -30.811)"><tspan style="font-size:2px;font-family:Arial;fill:${color};stroke:none;text-align:center;" x="${61.2+x2}" y="${85.6+y2}">${block.offense}</tspan></text>`;
          else if(block.defense)
            marks += `<text xml:space="preserve" x="${61+x2}" y="${86+y2}" transform="translate(-13.749 -30.811)"><tspan style="font-size:2px;font-family:Arial;fill:${color};stroke:none;text-align:center;" x="${61.2+x2}" y="${85.6+y2}">${block.defense.replace('G','').replace('F','')}</tspan></text>`;
        }
        if(block.player)
          marks += `<text xml:space="preserve" x="${61+x2}" y="${90+y2}" transform="translate(-13.749 -30.811)"><tspan style="font-size:1px;font-family:Arial;fill:${color};stroke:none;text-align:center;" x="${58+x2}" y="${87+y2}">${block.player}</tspan></text>`;
      } else console.warn("Bad block location?", block);
      out.push(marks);
    });
    out.push('</svg>');
    out.push('</div></div>');
    return out.join("\n");
  }
  showStats(player_stats, lineup, game) {
    const out = [];
    out.push(`<table cellspacing="0" cellpadding="2">`);
    const batStats = {};
    const fieldStats = {};
    const pitchStats = {};
    const catchStats = {};
    lineup.forEach((playerId)=>
    {
      const stats = player_stats[playerId];
      if(!stats) return;
      Object.keys(stats.battingStats).forEach((bstat,i)=>{
        if(stats.battingStats[bstat]>0)
          batStats[i] = bstat;
      });
      Object.keys(stats.fieldingStats).forEach((fstat,i)=>{
        if(stats.fieldingStats[fstat]>0)
          fieldStats[i] = fstat;
      });
      Object.keys(stats.pitchingStats).forEach((pstat,i)=>{
        if(stats.pitchingStats[pstat]>0)
          pitchStats[i] = pstat;
      });
      Object.keys(stats.catchingStats).forEach((cstat,i)=>{
        if(stats.catchingStats[cstat]>0)
          catchStats[i] = cstat;
      });
    });
    
    var stat = '';
    const tbstats = {};
    const tfstats = {};
    const tpstats = {};
    const tcstats = {};
    Object.values(batStats).forEach((gstat)=>tbstats[gstat]=0);
    Object.values(fieldStats).forEach((fstat)=>tfstats[fstat]=0);
    Object.values(pitchStats).forEach((pstat)=>tpstats[pstat]=0);
    Object.values(catchStats).forEach((pstat)=>tcstats[pstat]=0);
    // console.log("Good stats", {batting:batStats,fielding:fieldStats,pitching:pitchStats,catching:catchStats});
    out.push(`<thead><tr><td></td>`);
    out.push(`<td colspan="${Object.values(batStats).length}">Offense</td>`);
    const fcols = Object.values(fieldStats).length;
    if(fcols)
      out.push(`<td colspan="${Object.values(fieldStats).length}">Fielding</td>`);
    out.push(`</tr><tr><td></td>`);
    out.push(Object.values(batStats).map((s,i)=>`<td class="key" title="${PlayerStatTitles.battingStats[s]||""}">${s.toUpperCase()}</td>`).join(''));
    if(fcols) {
      out.push(Object.values(fieldStats).map((s,i)=>`<td class="key" title="${PlayerStatTitles.fieldingStats[s]||""}">${s.toUpperCase()}</td>`).join(''));
    }
    out.push(`</tr></thead><tbody>`);
    const pitchers = Object.values(player_stats).filter((ps)=>ps.pitchingStats['#P']>0);
    lineup.forEach((playerId)=>{
      const pstats = player_stats[playerId];
      if(!pstats) return;
      var player = playerId;
      let plink = `/stats?player=${playerId}`;
      if(typeof(playerId)=="number"&&!!game)
        player = `Unknown (${game?.teams[playerId].name})`;
      else if(game?.findPlayer)
        player = game.findPlayer(playerId);
      else if(game[playerId]&&!!game[playerId].game?.event)
      {
        const astat = game[playerId];
        if(astat.game.event?.pregame_data)
          if(astat.game.event.pregame_data.home_away=="away")
            player = "@ ";
          else player = "vs ";
        player += astat.game.event?.pregame_data.opponent_name;
        if(astat.game.event?.event?.start?.datetime)
          player = new Date(astat.game.event.event.start.datetime).toLocaleDateString() + ": " + player;
        plink = `/?game=${playerId}`;
      }
      else if(!game)
        plink = `/?game=${playerId}`;
      if(!player||player==playerId)
      {
        var found = false;
        if(game?.teams)
          for(var side = 0; side<2; side++)
          {
            found = [...game.teams[side].players].find((p)=>p.id==playerId);
            if(found) break;
          }
        if(found)
        {
          player = `${found.first_name} ${found.last_name}`;
        }
      }
      if(typeof(player)=="object")
        player = `${player.first_name} ${player.last_name}`;
      if(player.indexOf(" ")>-1&&plink.indexOf("player=")>-1)
        plink = `/stats?player=${encodeURIComponent(player)}`;
      if(player.indexOf('-')>-1&&player.length===36)
        plink = `/?game=${player}`;
      out.push(`<tr><td><a href="${plink}">${player}</a></td>`);
      for(stat of Object.values(batStats))
      {
        let s = pstats.battingStats[stat];
        if(!s) {
          out.push('<td></td>');
          continue;
        }
        tbstats[stat] += s;
        out.push(`<td>${s}</td>`);
      }
      for(stat of Object.values(fieldStats))
      {
        let s = pstats.fieldingStats[stat];
        if(!s) {
          out.push('<td></td>');
          continue;
        }
        tfstats[stat] += s;
        out.push(`<td>${s}</td>`);
      }
      out.push(`</tr>`);
    });
    out.push(`</tbody><tfoot><tr><td>Total</td>`);
    ['avg','obp','ops','slg'].forEach((k)=>{
        if(tbstats[k])
          tbstats[k] = (tbstats[k]/lineup.length).toFixed(3);
    });
    out.push(`<td>${Object.values(tbstats).join('</td><td>')}</td>`);
    if(fcols>0)
      out.push(`<td>${Object.values(tfstats).join('</td><td>')}</td>`);
    out.push(`</tr></tfoot>`);
    out.push('</table>');
    if(Object.values(pitchStats).length+Object.values(catchStats).length==0)
      return out.join("\n");
    out.push('<table cellspacing="0" cellpadding="2">');
    out.push(`<thead><tr><td></td>`);
    if(Object.values(pitchStats).length)
      out.push(`<td colspan="${Object.values(pitchStats).length}">Pitching</td>`);
    if(Object.values(catchStats).length)
      out.push(`<td colspan="${Object.values(catchStats).length}">Catching</td>`);
    out.push(`</tr><tr><td></td>`);
    out.push(Object.values(pitchStats).map((s,i)=>`<td class="key" title="${PlayerStatTitles.pitchingStats[s]||""}">${s.toUpperCase()}</td>`).join(''));
    if(Object.values(catchStats).length)
    {
      out.push(Object.values(catchStats).map((s,i)=>`<td class="key" title="${PlayerStatTitles.catchingStats[s]||""}">${s.toUpperCase()}</td>`).join(''));
    }
    out.push(`</tr></thead><tbody>`);
    lineup.forEach((playerId)=>{
      const pstats = player_stats[playerId];
      if(!pstats) return;
      if(!pstats.pitchingStats['#P']&&!pstats.catchingStats['#C']) return;
      var player = playerId;
      let plink = `/stats?player=${encodeURIComponent(playerId)}`;
      if(typeof(playerId)=="number"&&!!game)
        player = `Unknown (${game?.teams[playerId].name})`;
      else if(game?.findPlayer)
        player = game.findPlayer(playerId);
      else if(game[playerId]&&!!game[playerId].game?.event)
      {
        const astat = game[playerId];
        if(astat.game.event?.pregame_data)
          if(astat.game.event.pregame_data.home_away=="away")
            player = "@ ";
          else player = "vs ";
        player += astat.game.event?.pregame_data.opponent_name;
        if(astat.game.event?.event?.start?.datetime)
          player = new Date(astat.game.event.event.start.datetime).toLocaleDateString() + ": " + player;
        plink = `/?game=${playerId}`;
      }
      if(!player||player==playerId)
      {
        var found = false;
        if(game?.teams)
          for(var side = 0; side<2; side++)
          {
            found = [...game.teams[side].players].find((p)=>p.id==playerId);
            if(found) break;
          }
        if(found)
        {
          player = `${found.first_name} ${found.last_name}`;
        }
      }
      if(typeof(player)=="object")
        player = `${player.first_name} ${player.last_name}`;
      if(player.indexOf(" ")>-1&&plink.indexOf("player=")>-1)
        plink = `/stats?player=${encodeURIComponent(player)}`;
      if(player.indexOf('-')>-1&&player.length===36)
        plink = `/?game=${player}`;
      out.push(`<tr><td><a href="${plink}">${player}</a></td>`);
      for(stat of Object.values(pitchStats))
      {
        let s = pstats.pitchingStats[stat];
        if(!s) {
          out.push('<td></td>');
          continue;
        }
        if(stat=="ip")
          tpstats.ip = Util.addIP(tpstats.ip, s);
        else
          tpstats[stat] += s;
        out.push(`<td>${s}</td>`);
      }
      for(stat of Object.values(catchStats))
        {
          let s = pstats.catchingStats[stat];
          if(!s) {
            out.push('<td></td>');
            continue;
          }
          tcstats[stat] += s;
          out.push(`<td>${s}</td>`);
        }
      out.push(`</tr>`);
    });
    if(pitchers.length > 0)
    {
      if(tpstats.era)
        tpstats.era = (tpstats.era / pitchers.length).toFixed(3);
      if(tpstats.whip)
        tpstats.whip = (tpstats.whip / pitchers.length).toFixed(3);
      if(tpstats.gp)
        tpstats.gp = (tpstats.gp / pitchers.length).toFixed(1);
      if(tpstats['ip'])
        tpstats['ip'] = parseFloat(tpstats['ip'].toFixed(1));
    }
    out.push(`</tbody><tfoot><tr><td>Total</td>`);
    out.push(`<td>${Object.values(tpstats).join('</td><td>')}</td>`);
    if(Object.values(tcstats).length)
      out.push(`<td>${Object.values(tcstats).join('</td><td>')}</td>`);
    out.push('</table>')
    return out.join("\n");
  }
  writeScripts(res) {
    res.write(`</div><style type="text/css">
      .page{margin:0 20px;}
      .hidden{opacity:0.5}
      .summary thead td{font-size:14pt;text-align:center;padding:1px 5px;}
      .summary tbody td{font-size:20pt;padding:1px 5px;text-align:center;}
      .summary tbody td.teamname{text-align:left;}
      .games{max-height:80vh;overflow-y:auto;padding:10px;display:inline-block;border:1px solid black;}
      .float{position:absolute;margin-left:20px;background-color:white;border:1px solid black;padding:5px;}
      .hide{display:none}
      .stats table {margin-top:10px;}
      .stats tr td:first-of-type { border-left: 1px solid #aaa; }
      .stats tr td { border-top: 1px solid black; border-right: 1px solid #aaa; }
      .stats table { border-bottom: 1px solid black; }
      .stats thead, .stats tfoot { font-weight: bold; }
      .stats tr td:nth-of-type(even) { background-color: #eee; }
      .book td { padding: 4px; }
      .book td.block { padding: 0px; }
      .book tr:nth-of-type(even) { background-color: #eee; }
      .subs tr:nth-of-type(even), .subs tr, .info tr:nth-of-type(even) { background-color: white; }
      .subs td {border: 1px solid black;text-align:center;}
      .breakup{page-break-before:always;margin-top:20px;}
      .break{page-break-after:always;}
      a { text-decoration: none; color: #000099; }
      a:hover { text-decoration: underline; }
      td.top{border-top:4px solid black}
      .divify div { display: inline-block; }
      .item,.key { vertical-align: top; }
      .biggin{max-width:400px;max-height:300px;overflow:auto;}
      </style><style type="text/css" media="print">.page{margin:0px}.noprint{display:none}</style>`);
    res.write(`<script>
      document.querySelectorAll(".tablify .key,.divify .key").forEach((ktd)=>{
        var vtd = ktd.nextElementSibling;
        var sum = vtd.nextElementSibling;
        ktd.addEventListener('click',()=>{
          vtd.classList.toggle('hide');
          sum.classList.toggle('hide');
        });
        sum.addEventListener('click',()=>{
          vtd.classList.remove('hide');
          sum.classList.add('hide');
        });
      });
      document.querySelectorAll(".stats thead .key").forEach((el)=>el.addEventListener('click',({target})=>{
        const table = target.closest('table');
        // check if already sorted and add classes
        const asc = target.classList.contains('desc');
        target.classList.toggle('asc', asc)
        target.classList.toggle('desc', !asc)
        // get other headers
        const ths = [...target.parentNode.children];
        // get index of column
        const index = ths.indexOf(target); //target.getAttribute("data-index");
        // remove classes from other headers
        ths.forEach((th, i) => {
          if (i === index) return;
          th.classList.toggle('asc', false);
          th.classList.toggle('desc', false);
        })
        // first remove trs
        const tbody = table.querySelector("tbody");
        const rows = [...tbody.querySelectorAll('tr')].map((tr)=>[...tr.querySelectorAll('td')].map((td)=>td.textContent));
        // sort trs
        rows.sort((a,b) => {
          const left = a[index];
          const right = b[index]
          if (Number.isNaN(+left)) {
            // sort strings
            return left.localeCompare(right) * (asc ? 1 : -1);
          }
          // sort numbers
          return (left - right) * (asc ? 1 : -1);
        });
        // add trs back
        tbody.innerHTML = rows.map((row)=>'<tr>'+row.map((s)=>'<td>'+s+'</td>').join('')+'</tr>').join('');
      }));
      document.querySelectorAll('.tablify .bracket').forEach((el)=>el.addEventListener('click',()=>{
        var p = el.parentElement;
        var vtd = p.querySelector("table");
        var sum = p.querySelector(".sum");
        if(vtd&&sum)
        {
          if(!sum.classList.contains('toggle'))
          {
            sum.classList.add('toggle');
            sum.addEventListener('click',()=>{
              vtd.classList.toggle('hide');
              sum.classList.toggle('hide');
            });
          }
          vtd.classList.toggle('hide');
          sum.classList.toggle('hide');
        }
      }));
      document.querySelectorAll('.toggleNext').forEach((el)=>el.addEventListener('click',()=>{el.nextElementSibling.classList.toggle('hide');}));
      document.querySelectorAll('.togglePrev').forEach((el)=>el.addEventListener('click',()=>{el.previousElementSibling.classList.toggle('hide');})&&el.addEventListener('click',()=>{el.previousSibling.classList.toggle('hide')}));
      </script>`);
  }
}
module.exports = {GameChanger:gamechanger};
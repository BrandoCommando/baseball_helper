const CryptoJS = require("crypto-js");
const bcrypt = require("bcrypt");
const fetch = require('node-fetch');
const { ScoreBooks, ScoreBook, ScoreInning, ScoreBlock } = require('./scorebook');
const { Baseball, Game, Team } = require("./baseball");
const Util = require("./util");

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
  }
  flatten(e) {
    if(Array.isArray(e))
      return e.flatMap(this.flatten);
    switch(typeof e) {
      case "object":
        return e && Object.keys(e).sort().flatMap((t)=>{return this.flatten(e[t]);}) || ["null"];
      case "string":
        return [e];
      case "number":
        return ["".concat(e)];
      case "undefined":
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
      "gc-device-id": "202072e26b3f013628839d4fef57e47c",
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
            return resolve(data);
          } catch(e) {
            data = false;
          }
        } else if(typeof at == "object")
          return resolve(data);
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
    if(challenge?.type=="password-required")
    {
      let password = this.password;
      if(challenge.password_params)
        password = bcrypt.hashSync(password, challenge.password_params.salt);
      if(challenge.challenge_params)
        password = bcrypt.hashSync(password, challenge.challenge_params.salt);
      const access_token = await this.fetchApi({type:"password",password:password});
      if(access_token?.access?.data)
      {
        access_token.access.expiry = new Date(access_token.access.expires*1000);
        access_token.refresh.expiry = new Date(access_token.refresh.expires*1000);
        this.storeToken(access_token);
      }
    }
  }
  async videoStreamApi(teamId, gameId) {
    return this.getApi(`teams/${teamId}/schedule/events/${gameId}/video-stream/`);
  }
  async teamPlayersApi(teamId) {
    return this.getApi(`teams/${teamId}/players`);
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
          if(players.length&&!players[0].id&&players[0].length&&players[0][0].id)
            players = players[0];
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
      if(!team.players?.length)
        team.players = await this.loadPlayers(team.id);
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
      const plays = await this.getApi(`game-streams/${game.game_stream.id}/events`,true);
      if(plays.length)
        for(var pi=0;pi<plays.length;pi++)
          if(typeof plays[pi].event_data == "string")
            plays[pi].event_data = JSON.parse(plays[pi].event_data)
      game.processEvent(plays);
    }
    if(!game.teams[0].players)
      await this.loadPlayers(game.teams[0]);
    if(!game.teams[1].players)
      await this.loadPlayers(game.teams[1]);
  }
  async loadData() {
    await this.getToken();
    this.user = await this.getApi("me/user", true);
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
    if(req.query?.game)
    {
      const event = await this.getApi(`events/${req.query.game}`);
      if(event?.event?.team_id)
      {
        team = new Team(await this.getApi(`teams/${event.event.team_id}`));
        this.teams[team.id] = team;
      }
      const game = new Game({event},this.findData,team);
      if(game.event?.event?.id)
      {
        const summary = await this.getApi(`teams/${game.event.event.team_id}/game-summaries/${game.event.event.id}`);
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
        this.games.push(game);
        out = this;
      }
    }
    if(!out) {
      await this.loadData();
      out = this;
    }
    if(req.query?.format?.indexOf("json")>-1)
      res.send(out);
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
        if(typeof(player)=="object")
          player = `${player.first_name} ${player.last_name}`;
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
          res.write(`<div class="scorebook">`);
          for(var side=0;side<=1;side++)
          {
            /** @type ScoreBook */
            const book = game.scorebooks.getBook(side);
            res.write(`<div class="toggleNext ${side?"breakup":""}">${game.teams[side].name} (${side?"vs":"@"} ${game.teams[1-side].name}) on ${new Date(game.events[0].createdAt).toLocaleDateString()}</div>
              <table border="1">
              <thead><tr><td width="200">Player</td>`);
            book.columns.forEach((col)=>{
              if(!col.plays.find((play)=>play.playType||play.pitches.length)) return;
              res.write(`<td>${col.inning}</td>`);
            });
            res.write("</tr>\n");
            for(var benchPos=0;benchPos<game.lineup[side].length;benchPos++)
            {
              const playerId = game.lineup[side][benchPos];
              var player = game.findPlayer(playerId);
              if(!player||player==playerId)
              {
                var found = false;
                if(game.teams[side].players)
                  found = game.teams[side].players.find((p)=>p.id==playerId);
                if(found)
                {
                  player = `#${found.number} ${found.first_name} ${found.last_name}`.trim();
                }
              }
              res.write(`
                <tr><td>${benchPos+1}. ${player}</td>`);
              book.columns.forEach((col,colin)=>{
                if(!col.plays.find((play)=>play.playType||play.pitches.length)) return;
                let block = col.plays.find((b)=>b.playerId==playerId&&!b.used);
                if(!block&&colin==0)
                  block = col.plays.find((b)=>b.row==benchPos&&!b.used);
                if(block)
                  block.used = true;
                if(block?.top)
                  res.write(`<td class="top">`);
                else
                  res.write(`<td>`);
                if(block?.playType||block?.pitches?.length||block?.offense=="PR")
                {
                  res.write(`<div class="toggleNext">`);
                  res.write(ScoreBooks.getScoreHTML(block));
                  if(block.events?.length)
                    block.events.forEach((e)=>delete e.snapshotJ);
                  res.write(`</div><div class="hide float"><div class="biggin">${Util.tablify(block)}</div></div>`);
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
      res.write(`<html><head><title>${gc.email}</title></head><body><div class="page">`);
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
          const t1 = game.teams[0];
          const t2 = game.teams[1];
          if(!game.events?.length) {
            const linkStart = `<a href="?game=${game.event_id}${suffix}">`;
            if(gi==0)
              res.write('<table>');
            res.write('<tr>');
            let matchType = "vs";
            if(game.home_away == "home")
              matchType = "@";
            res.write(`<td>${linkStart}${game.getMyTeam().name} (${game.owning_team_score})</a></td>`);
            res.write(`<td>${matchType}<td>`);
            res.write(`<td>${linkStart}${game.getOtherTeam().name} (${game.opponent_team_score})</a></td>`);
            res.write(`<td>${linkStart}${game.last_scoring_update}</a></td>`);
            res.write('</tr>');
            if(gi==gc.games.length-1) res.write('</table>');
            return;
          }
          if(out.events) return;
          res.write(`<div class="toggleNext"><h1>${t1.name} (${game.runs[0]}) @ ${t2.name} (${game.runs[1]}) on ${new Date(game.events[0].createdAt).toDateString()}</h1></div>`);
          res.write(`<table border="1" class="hide">`);
          game.events.forEach(writeEventHTML);
          res.write("</table>");
          writeScorebook(game);
        });
      }

      res.write(`</div><style type="text/css">
        .page{margin:0 20px;}
        .hidden{opacity:0.5}
        .float{position:absolute;margin-left:20px;background-color:white;border:1px solid black;padding:5px;}
        .hide{display:none}
        .breakup{page-break-before:always;margin-top:20px;}
        .break{page-break-after:always;}
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
        </script>`)
      res.write(`<a href="/logout" class="noprint">Log Out</a>`);
      res.write(`</body></html>`);
      res.end();
    } else res.send(gc);
  }
}
module.exports = {GameChanger:gamechanger};
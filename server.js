const { PORT } = require('./config');
const express = require('express');
const app = express();
const { GameChanger } = require('./gamechanger');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const Cache = require('./cache');
const session = require('express-session');
const Db = require('./db');
const { PlayerStats } = require('./PlayerStats');
const MemoryStore = require('memorystore')(session);
const RedisStore = require('connect-redis').default;
const bb_session = session(
  {secret:"baseball",name:"baseball",saveUninitialized:false,resave:true,cookie:{secure:false,httpOnly:true,maxAge:24*60*60*1000
  ,store:new RedisStore({prefix:"Yermom",client:new Db("Redis").createClient(true)})
  }});
const { showTotalStats, writeScripts } = require('./html_generator');
const { Team, Game } = require('./baseball');
const Util = require('./util');


app.use(cookieParser());
app.use(bodyParser.json({limit:'2mb',verify:(req,res,buf,enc)=>{if(buf&&buf.length) req.rawBody = buf.toString(enc||'utf8');}}));
app.use(express.urlencoded({extended:true}));

/**
 * 
 * @param {Request} req 
 * @param {Response} res 
 */
function showLogin(req,res,showCode) {
  if(res.headersSent) return;
  if(req.headers.accept?.indexOf("html")==-1) res.status(302).header("Location: /login").send({error:"No Login"});
  let email = "";
  if(req.cookies.gc_email)
    email = req.cookies.gc_email;
  if(!res.headersSent)
    res.send(`
  <!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Brandon's Baseball Helper</title>
</head>
<body>
      <div style="display:grid;width:100vw;height:100vh;align-items:center;">
      <div style="text-align:center;border:1px solid black;max-width:90vw;width:400px;margin:0 auto;padding:10px;">
        <h1>Welcome to Brandon's Baseball Helper.</h1>
        <p>To continue, please log in with your GC credentials. Note, for security purposes, your credentials are not saved, so you have to log in after 10 minutes.</p>
    <form method="POST" action="/login">
    <table cellspacing="2" style="display:inline-block"><tr>
      <td><label for="user">Email:</label></td>
      <td><input type="email" id="user" name="user" value="${email}" /></td>
      </tr><tr>
      <td><label for="pass">Password:</label></td>
      <td><input type="password" id="pass" name="pass" /></td>
      `+(!!showCode?`
      </tr><tr>
      <td><label for="code">Code (if sent):</label></td>
      <td><input type="text" id="code" name="code" /></td>`:'')+`
      </tr></table><br />
    <input type="submit" value="Login" />
    </form>
      </div></div>
    </body></html>`);
}
app.get('/allkeys', async(req,res)=>{
  const cache = new Cache(req,res);
  await cache.keys('*')
    .then((keys)=>res.send(keys))
    .catch((e)=>res.status(404).json({error:e}));
});
app.get('/hkeys/:key/:pat?', async(req,res)=>{
  const cache = new Cache(req,res);
  await cache.hkeys(req.params.key)
    .then((keys)=>{
      if(req.params.pat)
        keys=[...keys].filter((k)=>`${k}`.match(req.params.pat));
      res.send({key:req.params.key,cache:keys});
    })
    .catch((e)=>res.status(404).json({error:e}));
});
app.get('/hgetall/:key', async(req,res)=>{
  const cache = new Cache(req,res);
  await cache.hgetall(req.params.key)
    .then((data)=>res.send(data))
    .catch((e)=>res.status(404).json({error:e}));
});
app.get('/hget/:key/:field', async(req,res)=>{
  const cache = new Cache(req,res);
  await cache.hget(req.params.key, req.params.field)
    .then((data)=>res.send(data))
    .catch((e)=>res.status(404).json({error:e}));
});
app.post('/hset/:key/:field', async(req,res)=>{
  const cache = new Cache(req,res);
  // console.log(`hset:${req.params.key}:${req.params.field}`, req.body);
  await cache.hset(req.params.key, req.params.field, req.body)
    .then((nums)=>res.send({success:nums,body:req.body}))
    .catch((e)=>!res.headersSent&&res.status(400).json({error:e}));
});
app.post('/config/:gameid', bb_session, async(req,res)=>{
  const cache = new Cache(req,res);
  const gc = new GameChanger(req.cookies.gc_email, null, cache);
  const game_id = req.params.gameid;
  const event = await gc.getApi(`events/${game_id}`,true);
  if(!event.event.team_id)
    console.warn('Bad event?', event);
  const team_id = event.event.team_id;
  const team = new Team(await gc.getApi(`teams/${team_id}`));
  const summary = await gc.getApi(`teams/${team_id}/game-summaries/${game_id}`);
  const players = await gc.teamPlayersApi(team_id);
  const game = new Game(summary, gc.findData, team);
  if(!team_id)
    console.warn('Bad team?', game);
  if(!req.body?.config) {
    if(req.headers.referer)
      return res.redirect(req.headers.referer);
    else res.redirect("/");
  }
  const config = req.body.config;
  if(config.lineup&&!config.lineupdates)
  {
    config.lineupdates = [];
    if(typeof(config.lineup)=="string")
    {
      config.lineup = config.lineup.replaceAll("\r\n", "\n").split("\n").map((row)=>row.split("\t"));
    }
    if(typeof(config.oppoline)=="string")
    {
      config.oppoline = config.oppoline.replaceAll("\r\n", "\n").split("\n").map((row)=>row.split("\t"));
    }
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
        if(!config.lineupdates[inning-1])
          config.lineupdates[inning-1] = {};
        config.lineupdates[inning-1][pos] = player.id;
      }
    }
  }
  if(req.body.command=="Send")
  {
    const entries = config.lineup.map((row)=>{
      const name = row[0];
      const player = players.find((p)=>p.name==name||p.full_name==name||p.long_name==name||p.first_name==name);
      if(!player?.id) {
        console.warn(`Unable to find player for ${name}`);
        return false;
      }
      let pos = row[1];
      if(!["P","C","1B","2B","3B","SS","LF","CF","RF"].indexOf(pos))
        pos = null;
      return {player_id: player.id, fielding_position: pos};
    }).filter((e)=>e);
    const lineup = { dh: null, dh_batting_for: null, entries };
    let lineup_id = false;
    if(req.body.lineup_id) lineup_id = req.body.lineup_id;
    if(event?.pregame_data?.lineup_id) lineup_id = event.pregame_data.lineup_id;
    if(!lineup_id)
    {
      lineup.team_id = team_id;
      lineup.id = Util.uuid();
      await gc.fetchApi({lineup}, 'bats-starting-lineups/');
    } else {
      await gc.fetchApi({updates:lineup}, `bats-starting-lineups/${lineup_id}`, {method:"PATCH"});
    }
      
  }
  await cache.hset('gamechanger_config', req.params.gameid, config)
    .then((result)=>{
      if(req.headers.referer)
        return res.redirect(req.headers.referer);
      res.send({result,config})
    }).catch();
  if(!res.headersSent)
    res.send({success:0,message:"Not sure what happened"});
});
app.get('/check', bb_session, async(req,res)=>{
  const cache = new Cache(req,res);
  let checks = 0;
  if(req.cookies.gc_email)
  {
    const gc = new GameChanger(req.cookies.gc_email,false,cache);
    await gc.checkForUpdates();
    checks++;
  } else {
    await cache.hkeys('gamechanger_tokens')
      .then(async(keys)=>{
        for(const key of keys)
        {
          const token = await cache.hget('gamechanger_tokens', key);
          const gc = new GameChanger(token,false,cache);
          gc.email = key;
          const updates = await gc.checkForUpdates();
          console.log(`Updates for ${key}`, updates);
          checks++;
        }
      });
  }
  res.send({checks});
});
app.get('/refresh_all', bb_session, async(req,res)=>{
  const cache = new Cache(req,res);
  await cache.hkeys('gamechanger_tokens')
    .then(async(keys)=>{
      let attempts = 0;
      const fails = {};
      const tokens = {};
      for(const key of keys)
      {
        attempts++;
        const token = JSON.parse(await cache.hget('gamechanger_tokens',key));
        const gc = new GameChanger(token,false,cache);
        await gc.refreshToken(true).then((token)=>{
          if(typeof(token)=="object")
          {
            tokens[key] = token;
          } else fails[key] = token;
        })
        .catch((e)=>{
          fails[key] = e;
        });
      }
      const refCount = Object.keys(tokens).length;
      if(!refCount) {
        return res.send({success:1,refreshes:0,attempts,fails});
      }
      await cache.hsetall('gamechanger_tokens', tokens).catch();
      Object.keys(fails).forEach(async(key)=>{
        await cache.hdel('gamechanger_tokens', key);
      });
      console.log(`Refreshed ${refCount} tokens`);
      res.send({success:1,refreshes:refCount,attempts,fails});
    })
    .catch((e)=>{
      console.error(e);
      res.send({success:0,error:JSON.stringify(e)});
    });
});
app.get('/video/:video_id', bb_session, async(req,res)=>{
  const cache = new Cache(req,res);
  let vcache = await cache.hget('gamechanger', 'video_'+req.params.video_id);
  if(typeof(vcache)=="string")
    vcache = JSON.parse(vcache);
  if(vcache&&typeof(vcache)=="object"&&vcache?.url)
  {
    let url = vcache.url.replace('master.m3u8','480p30/playlist.m3u8');
    const opts = {credentials:"include",headers:{}};
    let suffix = "";
    let prefix = url.substr(0,url.lastIndexOf('/'));
    if(vcache.cookies)
      suffix = "?" + Object.keys(vcache.cookies).map((key)=>`${key.replace('CloudFront-','')}=${encodeURIComponent(vcache.cookies[key])}`).join('&');
    url += suffix;
    for(var hkey in Object.keys(req.headers))
      if(hkey.toLowerCase()!="cookie")
        opts.headers[hkey] = req.headers[hkey];
    console.log(`Request-Headers for ${url}`, JSON.stringify(opts.headers));
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
        res.send(blob.split("\n").map((s)=>s.startsWith("#")?s:`${prefix}/${s}${suffix}`).join("\n")+"\n");
      });
  }
  if(!res.headersSent)
    res.status(400).send({error:"Invalid URL probably",vcache,video_id:req.params.video_id});
});
app.get('/stats', bb_session, async(req,res)=>{
  const cache = new Cache(req,res);
  if(!req.cookies.gc_email) return showLogin(req,res);
  const gc = new GameChanger(req.cookies.gc_email, null, cache);
  if(req.query?.teams)
  {
    const teams = req.query.teams.split(',');
    const datas = {};
    const teamStats = new PlayerStats("Them");
    const ourStats = new PlayerStats("Us");
    let ourId = '';
    let scount = 0;
    for(var teamId of teams)
    {
      await cache.hget(`tstats_${req.cookies.gc_email}`, teamId)
        .then((data)=>{
          if(typeof(data)=="string") data = JSON.parse(data);
          let playernum = 1;
          for(var gameId in data)
          {
            datas[gameId] = data[gameId];
            for(var team in data[gameId])
            {
              playernum = 1;
              if(teams.indexOf(team)==-1)
                ourId = team;
  
              for(var player in data[gameId][team])
              {
                const pstats = new PlayerStats(data[gameId][team][player]);
                if(pstats.sprayChart.length)
                  pstats.sprayChart.forEach((hit)=>hit.player=playernum+" "+player);
                if(team==ourId)
                  ourStats.accumulate(pstats);
                else teamStats.accumulate(pstats);
                scount++;
                playernum++;
              }
            }
          }
        });
    }
    if(req.query.format=="json")
      return res.header('Content-Type', 'application/json').send({teamStats:teamStats.toJson(),ourStats:ourStats.toJson(),datas});
    if(!res.headersSent)
    {
      res.header('Content-Type', 'text/html');
      res.write(`Total Stats: ${scount}`);
      res.write(showTotalStats(teamStats, datas, teams));
      res.write(showTotalStats(ourStats, datas, ourId));
      writeScripts(res);
      res.end();
    }
    if(!res.headersSent)
      res.send({requests:gc.requests,datas});
  }
  if(req.query?.team)
  {
    const teamId = req.query.team;
    if(req.query.recrunch)
    {

    }
    await cache.hget(`tstats_${req.cookies.gc_email}`, teamId)
      .then(async (data)=>{
        if(typeof(data)=="string") data = JSON.parse(data);
        const teamStats = new PlayerStats(teamId);
        const ourStats = new PlayerStats("Us");
        let ourId = '';
        let scount = 0;
        let playernum = 1;
        for(var gameId in data)
        {
          for(var team in data[gameId])
          {
            playernum = 1;
            if(team!=teamId)
              ourId = team;

            for(var player in data[gameId][team])
            {
              const pstats = new PlayerStats(data[gameId][team][player]);
              if(pstats.sprayChart.length)
                pstats.sprayChart.forEach((hit)=>hit.player=player);
              if(team==teamId)
                teamStats.accumulate(pstats);
              else ourStats.accumulate(pstats);
              scount++;
              playernum++;
            }
          }
        }
        if(req.query.format=="json")
          return res.header('Content-Type', 'application/json').send({teamStats:teamStats.toJson(),ourStats:ourStats.toJson(),data});
        res.header('Content-Type', 'text/html');
        res.write(`Total Stats: ${scount}`);
        res.write(showTotalStats(teamStats, data, teamId));
        res.write(showTotalStats(ourStats, data, ourId));
        writeScripts(res);
        res.end();
        if(!res.headersSent)
          res.send({requests:gc.requests,data});
      })
      .catch((e)=>{
        console.error("Bad stats", e);
        if(!res.headersSent)
          res.status(404).json({error:e});
      });
    return;
  }
  if(req.query?.player)
    await cache.hget(`stats_${req.cookies.gc_email}`, req.query.player)
      .then(async(data)=>{
        let allStats = JSON.parse(data);
        if(!allStats) {
          console.error("Bad Stats!", data);
          return res.status(400).send("Bad Stats");
        }
        const totalStats = new PlayerStats(req.query.player);
        const games = Object.keys(allStats);
        for(var gameId of games) {
          // console.log(gameId,allStats[gameId]);
          const game = await gc.getGameData(gameId);
          if(game?.event?.event?.start&&!!req.query.solo)
            if(new Date(allStats[gameId].game?.event?.event?.start?.datetime).getFullYear()!=req.query.solo)
            {
              delete allStats[gameId];
              continue;
            }
          if(game?.teams?.length&&!!req.query.teamId)
            if(!game.teams.find((t)=>req.query.teamId.indexOf(t.id)>-1))
            {
              delete allStats[gameId];
              continue;
            }
          totalStats.accumulate(allStats[gameId]);
          allStats[gameId].game = game;
        }
        const batterIds = {};
        totalStats.battingEvents.forEach((be)=>{
          if(!batterIds[be.batterId])
          {
            batterIds[be.batterId] = {};
          }});
        for(var playerId in batterIds)
        {
          batterIds[playerId].clips = await gc.getApi(`video-clips/player/${playerId}/clips`, false, {"Content-Type": "application/vnd.gc.com.none+json; version=0.0.0", "Accept": "application/vnd.gc.com.video_clip_asset_metadata:list+json; version=0.3.0", "x-pagination": "true"});
        }
        if(req.query.year)
        {
          const yearStats = {};
          for(var gameId of games)
          {
            if(!allStats[gameId]) continue;
            let gyear = '2025';
            if(allStats[gameId].game?.event?.event?.start)
              gyear = new Date(allStats[gameId].game?.event?.event?.start?.datetime).getFullYear();
            if(!yearStats[gyear])
              yearStats[gyear] = new PlayerStats(allStats[gameId]);
            else
              yearStats[gyear].accumulate(allStats[gameId]);
          }
          allStats = yearStats;
        }
        if(req.query?.format=='json')
          return res.send({totalStats:totalStats.toJson(),allStats,batterIds,requests:gc.requests});
        if(req.query.short)
          gc.shortmode = true;
        res.header('Content-Type', 'text/html');
        res.write(`Total Stats: ${Object.keys(allStats).length}`);
        const nas = {};
        // nas[req.query.player] = allStats;
        res.write(showTotalStats(totalStats, allStats));
        writeScripts(res);
        res.end();
      })
      .catch((e)=>{
        console.error("Bad stats", e);
        if(!res.headersSent)
          res.status(404).json({error:e});
      });
  else if(!res.headersSent)
    await cache.hkeys(`stats_${req.cookies.gc_email}`)
      .then((players)=>{
        res.send([...players].sort().map(player=>`<a href="/stats?player=${encodeURIComponent(player)}">${player}</a><br />`).join("\n"));
      })
      .catch((e)=>res.status(404).json({error:e}));
});
app.get('/schedule', bb_session, async(req,res)=>{
  const gc_email = req.cookies?.gc_email || req.query.gc_email || req.query.email;
  const cache = new Cache(req, res);
  const gc = new GameChanger(gc_email, null, cache);
  const token = await gc.getToken();
  if(!token?.access)
    return showLogin(req,res,token!=null);
  const schedule = this.schedule = await gc.getApi(`me/schedule`, true).then((s)=>s?.schedule?s.schedule:s);
  let filtered = [...schedule.events];
  if(req.query?.filter)
  {
    const filter = `${req.query.filter}`.toLowerCase();
    if(schedule?.events?.length)
      filtered = filtered.filter((e)=>{
        return JSON.stringify(e).toLowerCase().indexOf(filter)>-1;
      });
  }
  if(req.query.team)
    filtered = filtered.filter((e)=>req.query.team.indexOf(e.team_id)>-1);
  if(req.query.kind)
    filtered = filtered.filter((e)=>e.kind==req.query.kind);
  if(req.query.incomplete)
    filtered = filtered.filter((e)=>!e.scoring||e.scoring.state!="completed");
  const now = Date.now();
  if(req.query.started)
    filtered = filtered.filter((e)=>Date.parse(e.start_time)<=now);
  if(req.query.future)
    filtered = filtered.filter((e)=>Date.parse(e.end_time)>now);
  for(var i=0;i<filtered.length;i++)
  {
    const e = filtered[i];
    e.locale_start_time = Util.toLocaleDateTimeString(e.start_time);
    e.team = await gc.getApi(`teams/${e.team_id}`).then((t)=>{
      if(typeof(t)=="object"&&t?.id)
        return {id:t.id,name:t.name};
    });
    const event = await gc.getApi(`events/${e.id}`);
    if(event.event)
      e.event = event.event;
    if(event.pregame_data)
      e.pregame_data = event.pregame_data;
    // if(req.query.publishable)
    // e.video_stream = await gc.videoStreamApi(e.team_id, e.id).then((s)=>typeof(s)=="object"?s:{"error":s});
  }
  if(req.query.publishable)
  {
    await Promise.all(filtered.map((event)=>
        gc.videoStreamApi(event.team_id, event.id)
          .then((s)=>typeof(s)=="object"?s:{"error":s})
          .then((stream)=>event.video_stream=stream)));
    filtered = filtered.filter((e)=>e.video_stream?.publish_url);
  }
  filtered.sort((a,b)=>{
    if(typeof(a)!="object"||typeof(b)!="object") return 0;
    let ae = a.event;
    let be = b.event;
    if(ae.end?.datetime&&be.end?.datetime)
    {
      const da = Date.parse(ae.end.datetime);
      const db = Date.parse(be.end.datetime);
      if(da<db) return -1;
      if(da>db) return 1;
    }
    return 0;
  });
  return res.send({schedule:filtered,query:req.query});
});
app.get('/', bb_session, async(req,res)=>{
  const cache = new Cache(req,res);
  let gc_email = req.cookies?.gc_email;
  if(!gc_email && req.query?.gc_email)
    gc_email = req.query.gc_email;
  if(gc_email)
  {
    const gc = new GameChanger(gc_email, null, cache);
    const token = await gc.getToken();
    if(token?.access)
    {
      const me = await gc.getApi("me/user", true);
      if(me.id)
      {
        console.log(`Logged in with ${gc_email}`, me);
        await gc.handleReq(req,res);
        // console.log("Heap Diff", hd.end());
      } else console.warn("Invalid user", me);
      // else res.clearCookie("gc_token");
    } else {
      console.warn("Invalid token", token);
      showLogin(req,res,token!=null);
    }
  }
  showLogin(req,res);
  });
app.get('/refresh', bb_session, async(req,res)=>{
  if(req.cookies?.gc_email)
  {
    const cache = new Cache(req, res);
    const gc = new GameChanger(req.cookies.gc_email, null, cache);
    const out = {token:await gc.getToken()};
    out.refresh = await gc.refreshToken();
    res.send(out);
  }
  if(!res.headersSent)
  {
    res.redirect('/login');
    res.send({"error":"no login"});
  }
});
app.post('/send', bb_session, async(req,res)=>{
  if(req.cookies?.gc_email)
  {
    const cache = new Cache(req,res);
    const gc = new GameChanger(req.cookies.gc_email, null, cache);
    const token = await gc.getToken();
    if(token?.access)
    {
      const me = await gc.getApi("me/user", true);
      if(me.id)
      {
        // console.log(`Logged in with ${req.cookies.gc_email}`, me);
        if(req.body.action)
          res.send(await gc.fetchApi(req.body.body, req.body.action, req.body.headers));
        else if(req.body.stream_id) {
          let sequence_number = req.body.sequence_number;
          const event_data = req.body.event_data ?? {};
          if(req.body.code)
            event_data.code = req.body.code;
          if(req.body.attributes)
            event_data.attributes = req.body.attributes;
          if(!sequence_number)
          {
            const events = await gc.fetchApi(false, `game-streams/${req.body.stream_id}/events`);
            sequence_number = [...events].pop().sequence_number + 1;
          }
          res.send(await gc.sendStreamEvent(req.body.stream_id, sequence_number, event_data));
        }
      } else console.warn("Invalid user", me);
      // else res.clearCookie("gc_token");
    } else {
      console.warn("Invalid token", token);
      showLogin(req,res,true);
    }
  }
  showLogin(req,res);
});
app.get('/login', bb_session, async(req,res)=>{
  showLogin(req,res,!!req.query.show_code);
});
app.post('/login', bb_session, async(req,res)=>{
  const cache = new Cache(req, res);
  if(req.body.user&&req.body.pass)
  {
    res.cookie("gc_email", req.body.user);
    console.log(`Logging in with ${req.body.user}`);
    const gc = new GameChanger(req.body.user,req.body.pass,cache);
    if(req.body.code) gc.code = req.body.code;
    console.log("About me?", await gc.getApi("me/user",true));
  }
  if(req.headers.referer&&req.headers.referer.indexOf("/login")==-1)
    res.redirect(req.headers.referer);
  else res.redirect('/');
});
app.get('/logout', bb_session, async(req,res)=>{
  const cache = new Cache(req, res);
  if(req.cookies.gc_email)
    await cache.hdel("gamechanger_tokens", req.cookies.gc_email);
  if(!!req.session)
    req.session.destroy();
  res.redirect("/login");
});
app.get('/get/:key', bb_session, async(req,res)=>{
  const cache = new Cache(req, res);
  const key = req.params.key;
  const data = await cache.hget("gamechanger", key);
  if(data)
  {
    if(data=JSON.parse(data))
      res.json(data);
    else res.send(data);
  }
  res.status(400).send(`Not Found: ${key}`);
});
app.get('/api/:path', bb_session, async(req,res)=>{
  const cache = new Cache(req, res);
  const path = req.params.path;
  const gc = new GameChanger(req.cookies.gc_email, null, cache);
  const data = await gc.getApi(path, true);
  if(Array.isArray(data))
    data.forEach((item)=>{
      if(typeof(item.event_data)=="string")
        item.event_data = JSON.parse(item.event_data);
    });
  if(data)
    res.json(data);
  else
    res.status(400).send(`Not Found: ${path}`);
});
  
app.get('/keys', bb_session, async(req,res)=>{
  const cache = new Cache(req, res);
	res.send({keys:await cache.hkeys("gamechanger")});
});
app.get('/dump', bb_session, async(req,res)=>{
  const cache = new Cache(req, res);
	res.send(await cache.hgetall("gamechanger"));
});

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

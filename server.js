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
  {secret:"baseball",name:"baseball",saveUninitialized:false,resave:true,cookie:{secure:false,httpOnly:true,maxAge:3600000
  ,store:new RedisStore({prefix:"Yermom",client:new Db("Redis").createClient(true)})
  }});


app.use(cookieParser());
app.use(bodyParser.json({limit:'2mb',verify:(req,res,buf,enc)=>{if(buf&&buf.length) req.rawBody = buf.toString(enc||'utf8');}}));
app.use(express.urlencoded({extended:true}));

/**
 * 
 * @param {Request} req 
 * @param {Response} res 
 */
function showLogin(req,res) {
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
      <td><input type="email" id="user" name="user" value="${req.cookies.gc_email||""}" /></td>
      </tr><tr>
      <td><label for="pass">Password:</label></td>
      <td><input type="password" id="pass" name="pass" /></td>
      </tr><tr>
      <td><label for="code">Code (if sent):</label></td>
      <td><input type="text" id="code" name="code" /></td>
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
app.get('/hkeys/:key', async(req,res)=>{
  const cache = new Cache(req,res);
  await cache.hkeys(req.params.key)
    .then((keys)=>res.send({key:req.params.key,cache:keys}))
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
    .then((nums)=>res.sendStatus(200).send({success:nums,body:req.body}))
    .catch((e)=>!res.headersSent&&res.sendStatus(400).json({error:e}));
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
      res.write(gc.showTotalStats(teamStats, datas, teams));
      res.write(gc.showTotalStats(ourStats, datas, ourId));
      gc.writeScripts(res);
      res.end();
    }
    if(!res.headersSent)
      res.send({requests:gc.requests,datas});
  }
  if(req.query?.team)
  {
    const teamId = req.query.team;
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
        res.write(gc.showTotalStats(teamStats, data, teamId));
        res.write(gc.showTotalStats(ourStats, data, ourId));
        gc.writeScripts(res);
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
          return res.send({totalStats:totalStats.toJson(),allStats});
        res.header('Content-Type', 'text/html');
        res.write(`Total Stats: ${Object.keys(allStats).length}`);
        const nas = {};
        // nas[req.query.player] = allStats;
        res.write(gc.showTotalStats(totalStats, allStats));
        gc.writeScripts(res);
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
app.get('/', bb_session, async(req,res)=>{
  const cache = new Cache(req,res);
  if(req.cookies?.gc_email)
  {
    const gc = new GameChanger(req.cookies.gc_email, null, cache);
    const token = await gc.getToken();
    if(token?.access)
    {
      const me = await gc.getApi("me/user", true);
      if(me.id)
      {
        console.log(`Logged in with ${req.cookies.gc_email}`, me);
        await gc.handleReq(req,res);
      } else console.warn("Invalid user", me);
      // else res.clearCookie("gc_token");
    } else {
      console.warn("Invalid token", token);
    }
  }
  showLogin(req,res);
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
  res.redirect("/");
});
app.get('/logout', bb_session, async(req,res)=>{
  const cache = new Cache(req, res);
  await cache.hdel("gamechanger", req.cookies.gc_email + "_access_token");
  if(!!req.session)
    req.session.destroy();
  res.redirect("/");
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

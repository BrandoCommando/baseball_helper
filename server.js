const { PORT } = require('./config');
const express = require('express');
const app = express();
const { GameChanger } = require('./gamechanger');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const Cache = require('./cache');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const bb_session = session(
  {secret:"baseball",name:"baseball",saveUninitialized:false,resave:false,cookie:{secure:false,httpOnly:true,maxAge:360000
  ,store:new MemoryStore({checkPeriod:360000})
  }});


app.use(cookieParser());
app.use(bodyParser.json({limit:'2mb',verify:(req,res,buf,enc)=>{if(buf&&buf.length) req.rawBody = buf.toString(enc||'utf8');}}));
app.use(express.urlencoded({extended:true}));

app.get('/', bb_session, async(req,res)=>{
  const cache = new Cache(req,res);
  if(req.cookies?.gc_email)
  {
    const gc = new GameChanger(req.cookies.gc_email, null, cache);
    const token = await gc.getToken();
    if(token?.access)
    {
      const me = await gc.getApi("me/user", true)
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
  if(!res.headersSent)
    res.send(`
    <form method="POST" action="/login">
    <label>Email: <input type="email" name="user" value="${req.cookies.gc_email}" /></label><br>
    <label>Password: <input type="password" name="pass" /></label><br>
    <input type="submit" />
    </form>
    `)
  });

app.post('/login', bb_session, async(req,res)=>{
  const cache = new Cache(req, res);
  if(req.body.user&&req.body.pass)
  {
    res.cookie("gc_email", req.body.user);
    console.log(`Logging in with ${req.body.user}`);
    const gc = new GameChanger(req.body.user,req.body.pass,cache);
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
  
app.get('/keys', bb_session, async(req,res)=>{
  const cache = new Cache(req, res);
	res.send({keys:await cache.hkeys("gamechanger")});
});
app.get('/dump', bb_session, async(req,res)=>{
  const cache = new Cache(req, res);
	res.send(await cache.hgetall("gamechanger"));
});

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

const { PORT } = require('./config');
const express = require('express');
const app = express();
const { GameChanger } = require('./gamechanger');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const Cache = require('./cache');
const cache = new Cache();

app.use(cookieParser());
app.use(bodyParser.json({limit:'2mb',verify:(req,res,buf,enc)=>{if(buf&&buf.length) req.rawBody = buf.toString(enc||'utf8');}}));
app.use(express.urlencoded({extended:true}));

app.get('/', async(req,res)=>{
  if(req.cookies?.gc_token)
  {
    const token = JSON.parse(req.cookies.gc_token);
    if(token?.access)
    {
      console.log(`Logged in with ${req.cookies.gc_user}`, token);
      const gc = new GameChanger(req.cookies.gc_user, null, cache);
      await gc.storeToken(token);
      await gc.handleReq(req,res);
    } else {
      console.warn("Invalid token", [token,req.cookies.gc_token]);
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

app.post('/login', async(req,res)=>{
  if(req.body.user&&req.body.pass)
  {
    res.cookie("gc_email", req.body.user);
    console.log(`Logging in with ${req.body.user}`);
    const gc = new GameChanger(req.body.user,req.body.pass,cache);
    console.log("About me?", await gc.getApi("me/user",true));
    const token = gc.token;
    if(token.access) {
      res.cookie("gc_token", JSON.stringify(token));
    }
  }
  res.redirect("/");
});
app.get('/logout', async(req,res)=>{
  res.clearCookie("gc_token");
  res.redirect("/");
});
  
app.get('/keys', async(req,res)=>{
	res.send({keys:await cache.hkeys("gamechanger")});
});
app.get('/dump', async(req,res)=>{
	res.send(await cache.hgetall("gamechanger"));
});

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

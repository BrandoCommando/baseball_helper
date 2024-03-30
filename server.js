const PORT = 8453;
const express = require('express');
const app = express();
const { GameChanger } = require('./gamechanger');
const bodyParser = require('body-parser');
const cache = require('memory-cache');

app.use(bodyParser.json({limit:'2mb',verify:(req,res,buf,enc)=>{if(buf&&buf.length) req.rawBody = buf.toString(enc||'utf8');}}));
app.use(express.urlencoded({extended:true}));

app.get('/', async(req,res)=>{
  const gc = new GameChanger(req.query.user||"brandroid64@gmail.com",req.query.pass||"",cache);
  return gc.handleReq(req,res);
  });
  
app.get('/keys', async(req,res)=>{
	res.send({keys:cache.keys()});
});
app.get('/dump', async(req,res)=>{
	res.send(cache.exportJson());
});

cache.put('start', {date:new Date()});

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

const { PlayerStats, PlayerStatTitles } = require("./PlayerStats");
const { Baseball, Game, Team } = require("./baseball");
const { ScoreBooks } = require("./scorebook");
const Util = require("./util");
const { format: formatDate } = require('date-and-time');

function writeEventHTML(e, res, gc) {
  if(!e.attributes||!e.code) return;
  let r = e.attributes?.result || e.attributes?.playType || "";
  let pr = e.shortResult || e.playResult || e.attributes?.playResult || "";
  const snap = e.snapshot;
  delete e.snapshot;
  let player = e.batterId || "";
  if(e.attributes.runnerId)
    player = e.attributes.runnerId;
  else if(e.attributes.playerId)
    player = e.attributes.playerId;
  if(typeof(player)=="string"&&gc?.findData)
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
    else if(!!e.pitcherId&&gc?.findData)
    {
      const pitcher = gc.findData("player", e.pitcherId);
      if(typeof(pitcher)=="object")
      {
        if(pitcher.full_name) pr = pitcher.full_name;
        else
          pr = `${pitcher.first_name} ${pitcher.last_name}`;
      }
    }
  }
  if(typeof(player)=="object")
  {
    if(player.full_name)
      player = player.full_name
    else if(player.long_name)
      player = player.long_name;
    else if(player.name)
      player = player.name;
    else
      player = `${player.first_name} ${player.last_name}`;
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
function writeScorebook(game, res, gc) {
  if(game.scorebooks)
  {
    res.write(`<div class="summary">`);
    const hrow = [''];
    const rows = [[game.teams[0].name||game.team.name],[game.teams[1].name||game.team.name]];
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
      res.write(showStats(game.player_stats, lineup, game));
    }
    res.write(`</div>`);
    res.write(`<div class="scorebook">`);
    for(var side=0;side<=1;side++)
    {
      /** @type ScoreBook */
      const players = game.teams[side].players;
      const book = game.scorebooks.getBook(side);
      res.write(`<div class="toggleNext breakup">${game.teams[side].name} (${side?"vs":"@"} ${game.teams[1-side].name}) on `);
      if(game.event?.event?.start?.datetime)
        res.write(Util.toLocaleDateTimeString(game.event.event.start.datetime));
      else
        res.write(Util.toLocaleDateTimeString(game.events[0].createdAt));
      res.write(`</div>
        <table class="book" border="1" cellpadding="0" cellspacing="0">
        <thead><tr><td>BO</td><td width="30">#</td>`);
      res.write(`<td width="160"><span class="toggleNext">Player / POS</span><div class="float hide">`);
      res.write(`<table><tr><td>${game.lineup[side].map((pid)=>[pid,players.find((p)=>p.id==pid).name].join('</td><td>')).join('</td></tr><tr><td>')}</td></tr></table>`);
      res.write(`</div></td>`);
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
          if(found?.full_name)
            player = found.full_name;
          else if(found?.last_name) {
            player = `${found.first_name} ${found.last_name}`;
          }
        } else if(typeof(player)=="object")
        {
          found = player;
          if(found?.full_name)
            player = found.full_name;
          else if(player.last_name)
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
          let block = col.plays.find((b)=>b.playerId==playerId&&!b.used&&(b?.playType||b?.pitches?.length||b?.offense=="PR"||b?.offense=="BB"));
          if(!block&&colin==0)
            block = col.plays.find((b)=>b.row==benchPos&&!b.used);
          if(block)
          {
            block.used = true;
            if(block.pitcherId&&gc?.findData)
            {
              const pitcher = gc.findData("player", block.pitcherId);
              if(typeof(pitcher)=="object")
              {
                if(pitcher.name)
                  block.pitcher = pitcher.name;
                else if(pitcher.full_name)
                  block.pitcher = pitcher.full_name;
                else if(pitcher.number)
                  block.pitcher = `#${pitcher.number} ${pitcher.first_name} ${pitcher.last_name}`;
                else if(pitcher.last_name)
                  block.pitcher = pitcher.last_name;
              }
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
          if(block?.playType||block?.pitches?.length||block?.offense=="PR"||block?.offense=="BB")
          {
            res.write(`<div class="toggleNext">`);
            res.write(getScoreHTML(block));
            if(block.events?.length)
              block.events.forEach((e)=>delete e.snapshotJ);
            res.write(`</div><div class="info hide float noprint"><div class="tablify biggin">${Util.tablify(block)}</div></div>`);
          } else if(block!=undefined) console.warn(`Bad Block in ${col}/${colin}?`, block);
          res.write(`</td>`);
        });
        res.write("</tr>");
      }
      res.write(`</table>`);
      const unused = book.columns.reduce((prev,col,coli)=>{
        col.plays.forEach((block)=>{
          block.coli = coli;
          if(!block.used)
            prev.push(block);
        });
        return prev;
      },[]);
      // if(unused.length) console.warn(`Unused blocks: ${unused.length}`, unused);
    }

    res.write("</div>");
  }
}

/**
 * 
 * @param {PlayerStats} totalStats 
 */
function showTotalStats(totalStats, allStats, teamId) {

  const out = [];
  if(totalStats?.sprayChart) out.push(showSprayChart(totalStats.sprayChart, 1));
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
    // out.push(this.drawStats(player_stats, lineup, allStats));
    out.push('<div class="stats">');
    out.push(showStats(player_stats, lineup, allStats));
    out.push('</div>');
    out.push(`<button class="togglePrev noprint">Toggle Stats</button>`);
  }
  return out.join("\n");
}

function showSprayChart(sprayChart, hideDetails) {
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
      if(block.player&&!hideDetails)
        marks += `<text xml:space="preserve" x="${61+x2}" y="${90+y2}" transform="translate(-13.749 -30.811)"><tspan style="font-size:1px;font-family:Arial;fill:${color};stroke:none;text-align:center;" x="${58+x2}" y="${87+y2}">${block.player}</tspan></text>`;
    } else console.warn("Bad block location?", block);
    out.push(marks);
  });
  out.push('</svg>');
  out.push('</div></div>');
  return out.join("\n");
}

function showStats(player_stats, lineup, game) {
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
      {
        // player = new Date(astat.game.event.event.start.datetime).toLocaleDateString() + ": " + player;
        // if(this.shortmode)
          player = new Date(astat.game.event.event.start.datetime).toLocaleDateString().replace("/2025","") + " " + player.replace("VLL Majors ","").replace(" - VLL Majors", "");
      }
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
          if(game.teams[side].players)
            found = Object.values(game.teams[side].players).find((p)=>p.id==playerId);
          if(found) break;
        }
      if(found?.full_name)
      {
        player = found.full_name;
      }
    }
    if(player?.full_name)
      player = player.full_name;
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
      if(['h','1B','2B','3B','hr','roe'].indexOf(stat)>-1)
      {
        const events = [...pstats.battingEvents].filter((fe)=>{
          if(stat=='h') return fe.offense;
          if(stat=='roe') return fe.offense == 'E';
          else return fe.offense == stat;
        });
        if(events.length)
        {
        out.push('<td class="hasEvents">');
        out.push(`<span class="toggleNext">${s}</span>`);
        out.push(`<div class="info hide float biggin tablify">${Util.tablify(events)}</div>`);
        out.push('</td>');
        } else out.push(`<td>${s}</td>`);
      } else
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
      if(['a','po','e','dp'].indexOf(stat)>-1)
      {
        const events = [...pstats.fieldingEvents].filter((fe)=>{
          if(stat=='e') return fe.error;
          else if(stat=='po') return fe.putout;
          else if(stat=='a') return !fe.error && !fe.putout;
          if(stat=='dp') return fe.double_play;
          return false;
        });
        out.push('<td class="hasEvents">');
        out.push(`<span class="toggleNext">${s}</span>`);
        out.push(`<div class="info hide float biggin tablify">${Util.tablify(events)}</div>`);
        out.push('</td>');
      } else
        out.push(`<td>${s}</td>`);
    }
    out.push(`</tr>`);
  });
  out.push(`</tbody><tbody><tr><td>Total</td>`);
  ['avg','obp','ops','slg'].forEach((k)=>{
      if(tbstats[k])
        tbstats[k] = (tbstats[k]/lineup.length).toFixed(3);
  });
  out.push(`<td>${Object.values(tbstats).join('</td><td>')}</td>`);
  if(fcols>0)
    out.push(`<td>${Object.values(tfstats).join('</td><td>')}</td>`);
  out.push(`</tr></tbody>`);
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
        player = new Date(astat.game.event.event.start.datetime).toLocaleDateString().replace("/2025","") + " " + player.replace("VLL Majors ","").replace(" - VLL Majors", "");
      plink = `/?game=${playerId}`;
    }
    if(!player||player==playerId)
    {
      var found = false;
      if(game?.teams)
        for(var side = 0; side<2; side++)
        {
          if(game.teams[side].players)
            found = Object.values(game.teams[side].players).find((p)=>p.id==playerId);
          if(found) break;
        }
      if(found?.full_name)
      {
        player = found.full_name;
      }
    }
    if(player?.full_name)
      player = player.full_name;
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
    // if(tpstats.gp)
    //   tpstats.gp = (tpstats.gp / pitchers.length).toFixed(1);
    if(tpstats['ip'])
      tpstats['ip'] = parseFloat(tpstats['ip'].toFixed(1));
  }
  out.push(`</tbody><tbody><tr><td>Total</td>`);
  out.push(`<td>${Object.values(tpstats).join('</td><td>')}</td>`);
  if(Object.values(tcstats).length)
    out.push(`<td>${Object.values(tcstats).join('</td><td>')}</td>`);
  out.push('</tbody></table>')
  return out.join("\n");
}

function getScoreHTML(block) {
  var marks = "";
  let pspot = [0,0];
  const strikes = [];
  const balls = [];
  [...block.pitches].forEach((p,index)=>{
    if(p=="B"){balls.push(index);}else{strikes.push(index);}
  });
  if(block.pitches.length)
    block.pitches.forEach((pitch,num)=>{
      let stroke = "000";
      let y = 81.383;
      let xi = 0;
      if(pitch=="B")
      {
        balls.splice(0,1);
        if(pspot[1]==3&&balls.length)
          return;
        y = 89.167;
        xi = pspot[1]++;
        if(xi>=3) return;
      } else {
        strikes.splice(0,1);
        if(pspot[0]==2&&strikes.length>0)
          return;
        xi = pspot[0]++;
        if(pitch=="L")
          stroke = "900";
        else if(pitch=="F")
          stroke = "090";
        // if(xi>=2) return;
      }
      let x = 93.5 - (xi * 7.784);
      let fsize = 8;
      if(num>=9)
      {
        x-=2;
        fsize = 7;
      }
      marks += `<text xml:space="preserve" x="${x}" y="${y}" transform="translate(-13.749 -30.811)"><tspan style="font-weight:700;font-size:${fsize}px;font-family:Arial;fill:#${stroke};stroke:none;" x="${x}" y="${y}">${num+1}</tspan></text>`;
    });
  else {
    for(var ball=0;ball<Math.min(3,block.balls);ball++)
    {
      const x = 98 - ball * 7;
      const y = 82;
      marks += `
        <path style="fill:none;stroke:#000;stroke-width:1.2;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1;stroke-linecap:round" d="m${x} ${y}-6.362 7.23" transform="translate(-13.749 -30.811)"/>
        `;
    }
    for(var strike=0;strike<Math.min(2,block.strikes);strike++)
    {
      const x = 98 - strike * 7;
      const y = 75;
      marks += `
        <path style="fill:none;stroke:#000;stroke-width:1.2;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1;stroke-linecap:round" d="m${x} ${y}-6.362 7.23" transform="translate(-13.749 -30.811)"/>
        `;
    }
  }
  const outCodes = ["CS","FC","DP","PO"];
  const base1 = `<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1" d="m60 85 15-15" transform="translate(-13.749 -30.811)"/>`;
  const base2 = `<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1" d="m75 70 -15-15" transform="translate(-13.749 -30.811)"/>`;
  const base3 = `<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1" d="m60 55 -15 15" transform="translate(-13.749 -30.811)"/>`;
  const base4 = `<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1" d="m45 70 15 15" transform="translate(-13.749 -30.811)"/>`;
  if(!!block.runs)
  {
    marks += `<path style="fill:#006252;stroke-width:0;" d="m60 85 15-15-15-15-15 15 15 15z" transform="translate(-13.749 -30.811)"/>`;
    if(block.bases?.length==4)
      if(block.bases[3]=="HR"||block.bases[3]=="3B"||block.bases[3]=="2B")
        marks += base3;
  }
  let offense = block.offense;
  if(!offense&&block.bases[0])
    offense = block.bases[0];
  if(offense=="BB"||offense=="HP")
    marks += `${base1}<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round" d="M28.574 38.48a6.953 5.623 0 0 1-6.952 5.623 6.953 5.623 0 0 1-6.953-5.623 6.953 5.623 0 0 1 6.953-5.624 6.953 5.623 0 0 1 6.952 5.624z" transform="translate(-13 -30.811)"/>`;
  if(['SAC',"K"].indexOf(offense)>-1)
  {
    if(block.bases.length==1&&block.outs)
      marks += `<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1" d="m60 85 7.5-7.5m-.5 -1.5l1.943 1.943" transform="translate(-13.749 -30.811)"/>`;
    else marks += base1;
  }
  if(offense=="1B")
    marks += `${base1}<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round" d="M28.574 38.48a6.953 5.623 0 0 1-6.952 5.623 6.953 5.623 0 0 1-6.953-5.623 6.953 5.623 0 0 1 6.953-5.624 6.953 5.623 0 0 1 6.952 5.624z" transform="translate(-13 -19.811)"/>`;
  else if(['FC','E','Kd3'].indexOf(offense)>-1)
    marks += base1;
  if(offense=="2B")
    marks += `${base1}${base2}<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round" d="M28.574 38.48a6.953 5.623 0 0 1-6.952 5.623 6.953 5.623 0 0 1-6.953-5.623 6.953 5.623 0 0 1 6.953-5.624 6.953 5.623 0 0 1 6.952 5.624z" transform="translate(-13 -8.811)"/>`;
  if(offense=="3B")
    marks += `${base1}${base2}${base3}<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round" d="M28.574 38.48a6.953 5.623 0 0 1-6.952 5.623 6.953 5.623 0 0 1-6.953-5.623 6.953 5.623 0 0 1 6.953-5.624 6.953 5.623 0 0 1 6.952 5.624z" transform="translate(-13 2.189)"/>`;
  if(offense=="HR")
    marks += `${base1}${base2}${base3}${base4}<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round" d="M28.574 38.48a6.953 5.623 0 0 1-6.952 5.623 6.953 5.623 0 0 1-6.953-5.623 6.953 5.623 0 0 1 6.953-5.624 6.953 5.623 0 0 1 6.952 5.624z" transform="translate(-13 13.189)"/>`;
  else if(!!block.runs)
    marks += `${base4}`;
  if(block.bases?.length>=3&&(!block.bases[2]||outCodes.indexOf(block.bases[2].replace(/[0-9]*$/,""))==-1||block.bases.length>=4||!block.outs))
    marks += `${base3}`;
  if(block.bases?.length>=2&&(!block.bases[1]||outCodes.indexOf(block.bases[1].replace(/[0-9]*$/,""))==-1||block.bases.length>=3||!block.outs)&&block.bases[1]!="PR")
    marks += `${base2}`;
  if(!!block.bases[0]&&block.bases[0]!="PR")
    marks += `<text xml:space="preserve" style="font-style:normal;font-variant:normal;font-weight:400;font-stretch:normal;font-size:7.9375px;font-family:Arial;-inkscape-font-specification:Arial;text-align:center;text-anchor:middle;fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1" x="-5" y="110" transform="rotate(-45 -44.067 1.19)"><tspan style="font-style:normal;font-variant:normal;font-weight:700;font-stretch:normal;font-size:7.9375px;font-family:Arial;fill:#000;stroke:none;stroke-width:1.2" x="-5" y="110">${block.bases[0]}</tspan></text>`;
   if(!!block.bases[1]&&block.bases[1].replace(/[0-9]*$/,"")!="PR")
  {
     marks += `<text xml:space="preserve" style="font-style:normal;font-variant:normal;font-weight:400;font-stretch:normal;font-size:7.9375px;font-family:Arial;-inkscape-font-specification:Arial;text-align:center;text-anchor:middle;fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1" x="92.23" y="-4.87" transform="rotate(45 30.318 -32)"><tspan style="font-style:normal;font-variant:normal;font-weight:700;font-stretch:normal;font-size:7.9375px;font-family:Arial;fill:#000;stroke:none;stroke-width:1.2" x="92.23" y="-4.88">${block.bases[1]}</tspan></text>`;
    if(block.bases[1]&&outCodes.indexOf(block.bases[1].replace(/[0-9]*$/,""))>-1&&block.bases.length<=2&&block.outs)
      marks += `<path
          style="fill:none;stroke:#000000;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1"
          d="m 75,70 -7.7706,-7.770601"
          transform="translate(-13.749 -30.811)"
          />
        <path
          style="fill:none;stroke:#000000;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1"
          d="m 67.854858,61.240035 -1.94265,1.942654"
          transform="translate(-13.749 -30.811)"
          />`;
    else marks += base2;
  }
   if(!!block.bases[2]&&block.bases[2].replace(/[0-9]*$/,"")!="PR")
  {
    marks += `<text xml:space="preserve" style="font-style:normal;font-variant:normal;font-weight:400;font-stretch:normal;font-size:7.9375px;font-family:Arial;-inkscape-font-specification:Arial;text-align:center;text-anchor:middle;fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1" x="-6" y="80" transform="rotate(-45 -44.067 1.19)"><tspan style="font-style:normal;font-variant:normal;font-weight:700;font-stretch:normal;font-size:7.9375px;font-family:Arial;fill:#000;stroke:none;stroke-width:1.2" x="-6" y="80">${block.bases[2]}</tspan></text>`;
    if(block.bases[2]&&outCodes.indexOf(block.bases[2].replace(/[0-9]*$/,""))>-1&&block.bases.length<=3&&block.outs)
      marks += `<path
          style="fill:none;stroke:#000000;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1"
          d="m60 55-7.77 7.771M51 62l1.943 1.943"
          transform="translate(-13.749 -30.811)"
          />`;
    else marks += base3;
  }
   if(!!block.bases[3]&&(block.outs||block.runs))
  {
     marks += `<text xml:space="preserve" style="font-style:normal;font-variant:normal;font-weight:400;font-stretch:normal;font-size:7.9375px;font-family:Arial;-inkscape-font-specification:Arial;text-align:center;text-anchor:middle;fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1" x="92.23" y="25" transform="rotate(45 30.318 -32)"><tspan style="font-style:normal;font-variant:normal;font-weight:700;font-stretch:normal;font-size:7.9375px;font-family:Arial;fill:#000;stroke:none;stroke-width:1.2" x="91.31" y="25">${block.bases[3]}</tspan></text>`;
    if(block.bases[3]&&outCodes.indexOf(block.bases[3].replace(/[0-9]*$/,""))>-1&&block.outs)
      marks += `<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1" d="m45 70 7.725 7.816M52 78.763l1.954-1.931" transform="translate(-13.749 -30.811)"/>`
  }
  if(!!block.runs)
  {
    let x = 36-(block.runs>9?2.5:0);
    marks += `<path style="fill:none;stroke:green;stroke-width:1.2;stroke-linecap:round" d="M44 30a6 6 0 0 1-6 6 6 6 0 0 1-6-6 6 6 0 0 1 6-6 6 6 0 0 1 6 6z" transform="translate(-13.749 -19.811)"/>`;
    marks += `<text xml:space="preserve" x="${x}" y="43.8" transform="translate(-13.749 -30.811)"><tspan style="font-weight:700;font-size:8px;font-family:Arial;fill:#060;stroke:none;text-align:center;" x="${x}" y="43.8">${block.runs}</tspan></text>`;
  }
  if(!!block.rbis)
  {
    marks += `<path style="fill:none;stroke:blue;stroke-width:0.8;stroke-linecap:round" d="M44 70a6 6 0 0 1-6 6 6 6 0 0 1-6-6 6 6 0 0 1 6-6 6 6 0 0 1 6 6z" transform="translate(-13.749 -19.811)"/>`;
    marks += `<text xml:space="preserve" x="36" y="83.8" transform="translate(-13.749 -30.811)"><tspan style="font-size:8px;font-family:Arial;fill:blue;stroke:none;text-align:center;" x="36" y="83.8">${block.rbis}</tspan></text>`;
  }
     
  if(block.location?.length)
  {
    let stroke = "none";
    if(block.playType=="ground_ball"||block.playType=="bunt")
      stroke = "1.2,2.4"
    marks += `<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:${stroke};stroke-dashoffset:0;stroke-opacity:1" d="m60 85`;
    let x2 = (block.location[0]-160)/7;
    let y2 = (340-block.location[1])/-7;
    if(block.playType&&block.playType.indexOf("fly")>-1)
    {
      let dx1 = 6, dx2 = 6;
      let dy1 = -6, dy2 = y2;
      if(block.location[0]>160)
      {
        dx1 = dx2 = -6;
      }
      marks += `c ${dx1} ${dy1}, ${dx2} ${dy2}`;
    }
    if(!isNaN(x2)&&!isNaN(y2))
      marks += ` ${x2} ${y2}`;
    else console.warn("Bad block location?", block);
    marks += `" transform="translate(-13.749 -30.811)"/>`;
  }
  if(block.outs)
  {
    marks += `<text xml:space="preserve" x="88" y="43.8" transform="translate(-13.749 -30.811)"><tspan style="font-weight:700;font-size:8px;font-family:Arial;fill:#f00;stroke:none;text-align:center;" x="88" y="43.8">${block.outs}</tspan></text>`;
    marks += `<path style="fill:none;stroke:red;stroke-width:1.2;stroke-linecap:round" d="M96 30a6 6 0 0 1-6 6 6 6 0 0 1-6-6 6 6 0 0 1 6-6 6 6 0 0 1 6 6z" transform="translate(-13.749 -19.811)"/>`;
    if(block.defense)
    {
      marks += `<text xml:space="preserve" style="font-weight:700;font-size:19px;font-family:Arial;text-align:center;text-anchor:middle;fill:red;stroke:none;" x="60" y="62" transform="translate(-13.749 -30.811)"><tspan style="font-size:19px;fill:red;text-align:center;stroke:none;" x="60" y="62">${block.defense}</tspan></text>`;
    }
    if(['K','ꓘ'].indexOf(block.defense)>-1&&block.pitcher)
      marks += `<text xml:space'="preserve" style="font-weight:500;font-size:8px;font-family:Arial;text-align:center;text-anchor:middle;fill:red;stroke:none;" x="60" y="72" transform="translate(-13.749 -30.811)"><tspan style="font-size:8px;fill:red;text-align:center;stroke:none;" x="60" y="72">${block.pitcher}</tspan></text>`;
    else if(block.defense) {
      let defender = block.defender || "";
      if(defender)
        marks += `<text xml:space'="preserve" style="font-weight:500;font-size:7px;font-family:Arial;text-align:center;text-anchor:middle;fill:red;stroke:none;" x="60" y="72" transform="translate(-13.749 -30.811)"><tspan style="font-size:8px;fill:red;text-align:center;stroke:none;" x="60" y="72">${defender}</tspan></text>`;
    }
  }
  marks = `<svg width="162" height="112" viewBox="0 0 85.713 59.396" xmlns="http://www.w3.org/2000/svg">
      <path style="fill:none;stroke:#1a1a1a;stroke-width:.237034" d="M13.867 30.93h85.476v59.159H13.867z" transform="translate(-13 -30.811)"/>
      <path style="fill:none;stroke:#333;stroke-width:.264583;stroke-dasharray:1.5875,1.5875;stroke-dashoffset:0" d="m43.572 68.065 15.54-15.542 15.542 15.542-15.541 15.54z" transform="translate(-13 -28.894)"/>
      <path style="fill:none;stroke:#333;stroke-width:.27213;stroke-dasharray:1.63278,1.63278;stroke-dashoffset:0" d="M43.48 67.968 29.637 54.124" transform="translate(-13 -28.894)"/>
      <path style="fill:none;stroke:#333;stroke-width:.274281;stroke-dasharray:1.64569,1.64569;stroke-dashoffset:0" d="M74.654 68.065 88.5 54.22" transform="translate(-13 -28.894)"/>
      <path style="fill:none;stroke:#333;stroke-width:.264583;stroke-dasharray:1.5875,1.5875;stroke-dashoffset:0" d="M29.636 54.124S36.72 33.772 59.052 33.71C82.34 33.646 88.5 54.22 88.5 54.22" transform="translate(-13 -28.894)"/>
      <path style="fill:none;stroke:#333;stroke-width:.305288;stroke-dasharray:1.83173,1.83173;stroke-dashoffset:0" d="M84.044 82.423V74.79h7.633M76.26 90.207v-7.632h7.632M84.044 90.207v-7.632h7.633M91.83 90.207v-7.632h7.632M91.83 82.423V74.79h7.632" transform="translate(-13.749 -30.811)"/>
      <text xml:space="preserve" style="font-style:normal;font-variant:normal;font-weight:400;font-stretch:normal;font-size:7.05556px;font-family:Arial;-inkscape-font-specification:Arial;text-align:center;text-anchor:middle;fill:gray;stroke:none;stroke-width:.264583" x="21.856" y="41.065" transform="translate(-13 -30.811)"><tspan style="fill:gray;stroke-width:.264583" x="21.856" y="41.065">BB</tspan></text>
      <text xml:space="preserve" style="font-style:normal;font-variant:normal;font-weight:400;font-stretch:normal;font-size:7.05556px;font-family:Arial;-inkscape-font-specification:Arial;text-align:center;text-anchor:middle;fill:gray;stroke:none;stroke-width:.264583" x="21.731" y="52.037" transform="translate(-13 -30.811)"><tspan style="fill:gray;stroke-width:.264583" x="21.731" y="52.037">1B</tspan></text>
      <text xml:space="preserve" style="font-style:normal;font-variant:normal;font-weight:400;font-stretch:normal;font-size:7.05556px;font-family:Arial;-inkscape-font-specification:Arial;text-align:center;text-anchor:middle;fill:gray;stroke:none;stroke-width:.264583" x="22.008" y="63.009" transform="translate(-13 -30.811)"><tspan style="fill:gray;stroke-width:.264583" x="22.008" y="63.009">2B</tspan></text>
      <text xml:space="preserve" style="font-style:normal;font-variant:normal;font-weight:400;font-stretch:normal;font-size:7.05556px;font-family:Arial;-inkscape-font-specification:Arial;text-align:center;text-anchor:middle;fill:gray;stroke:none;stroke-width:.264583" x="21.967" y="73.981" transform="translate(-13 -30.811)"><tspan style="fill:gray;stroke-width:.264583" x="21.967" y="73.981">3B</tspan></text>
      <text xml:space="preserve" style="font-style:normal;font-variant:normal;font-weight:400;font-stretch:normal;font-size:7.05556px;font-family:Arial;-inkscape-font-specification:Arial;text-align:center;text-anchor:middle;fill:gray;stroke:none;stroke-width:.264583" x="21.689" y="85.022" transform="translate(-13 -30.811)"><tspan style="fill:gray;stroke-width:.264583" x="21.689" y="85.022">HR</tspan></text>
      ${marks}
    </svg>`;
  // return marks;
  return marks;
}

function writeMain(res,gc) {
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
  else if(gc.email) res.write(gc.email);
  res.write(`</title></head><body><div class="page">`);
  if(!gc.teams?.length)
    res.write(`<div class="noprint"><a href="/">Back to Teams</a></div>`);
  const suffix = gc.link_suffix || ""; //req.query.user ? `&user=${req.query.user}` : "";
  if(gc.events)
  {
    res.write(`<table border="1">`);
    if(gc.teams)
      res.write(`<caption>${gc.teams[0].name} @ ${gc.teams[1].name}</caption>`);
    gc.events.forEach((e)=>writeEventHTML(e,res,gc));
    res.write("</table>");
    writeScorebook(gc, res, gc);
  }
  if(gc.schedule?.length)
  {
    const needsTeam = gc.teams&&Object.keys(gc.teams).length>1;
    const future = gc.schedule
      .filter((s)=>s.event?.status!="cancelled"&&s.event?.start?.datetime&&new Date(s.event.start.datetime)>Date.now())
      .sort(Util.eventSort)
      .reverse();
    if(future.length)
    {
      res.write('<section class="games_wrap"><strong class="toggleNext">Upcoming Events</strong><div><div class="scroll">');
      res.write('<table>');
      future.forEach((s)=>{
        let title = s.event.title;
        if(s.event.sub_type?.indexOf('scrimmages')>-1)
        {
          if(title.indexOf("Game ")>-1)
            title = title.replace("Game ", "Scrimmage ");
          else title += " (Scrimmage)";
        }
        res.write('<tr>');
        if(needsTeam)
          res.write(`<td>${gc.teams[s.event.team_id].name}</td>`);
        res.write(`<td><a href="?event=${s.event.id}">${title}</a></td><td align="right">`);
        if(s.event?.start?.datetime)
        {
          const d = new Date(s.event.start.datetime);
          const end = new Date(s.event.end.datetime);
          res.write(Util.toLocaleDateTimeString(d,end));
          if(s.event.arrive?.datetime)
          {
            const early = (new Date(s.event.arrive.datetime) - d) / 60000;
            res.write(` (${early}m)`);
          }
        }
        res.write(`</td><td>`);
        res.write(`<span class="toggleNext">Info</span><div class="hide float">${Util.tablify(s)}</div></td></tr>`);
      });
      res.write('</table>');
      res.write('</div></div></section>');
    }
  }
  if(gc.games?.length)
  {
    res.write('<section class="games_wrap"><strong class="toggleNext">Games</strong><div>')
    gc.games.forEach((game,gi)=>{
      if(!game.teams) return;
      const t1 = game.teams[0];
      const t2 = game.teams[1];
      if(!game.events?.length) {
        const linkStart = `<a href="?game=${game.event_id}${suffix}">`;
        if(gi==0)
          res.write('<div class="games scroll"><table>');
        res.write('<tr>');
        let matchType = "@";
        let mypos = 0;
        if(game.home_away == "home")
        {
          matchType = "vs";
          mypos = 1;
        }
        const myteam = game.teams[mypos];
        const oppo = game.teams[1-mypos];
        res.write(`<td>${linkStart}${myteam.name} (${game.owning_team_score})</a></td>`);
        res.write(`<td>${matchType}<td>`);
        res.write(`<td>${linkStart}${oppo.name} (${game.opponent_team_score})</a></td>`);
        res.write(`<td>${linkStart}`);
        if(game.event?.event?.start?.datetime)
          res.write(Util.toLocaleDateTimeString(game.event.event.start.datetime, game.event.event.end.datetime));
        else if(game.event?.start?.datetime)
          res.write(Util.toLocaleDateTimeString(game.event.start.datetime, game.event.end.datetime));
        else
          res.write(game.last_scoring_update);
        res.write(`</a></td>`);
        res.write('</tr>');
        if(gi==gc.games.length-1) res.write('</table></div>');
        return;
      }
      if(gc.events) return;
      res.write(`<div class="toggleNext"><h1><a href="/stats?team=${t1.id}">${t1.name}</a> (${game.runs[0]}) @ <a href="/stats?team=${t2.id}">${t2.name}</a> (${game.runs[1]}) on `);
      if(game.event.event.start.datetime)
        res.write(Util.toLocaleDateTimeString(game.event.event.start.datetime));
      else
        res.write(Util.toLocaleDateTimeString(game.events[0].createdAt));
      res.write(`</h1></div>`);
      res.write(`<table border="1" class="hide">`);
      game.events.forEach((e)=>writeEventHTML(e,res,gc));
      res.write("</table>");
      writeScorebook(game, res, gc);
    });
    res.write('</div></section>');
  }

  if(gc.teams && Object.keys(gc.teams).length > 1)
    {
      res.write('<section class="teams"><strong class="toggleNext">My Teams</strong><div class="teams"><table><thead><tr><td>Team</td><td>Upcoming</td><td>Games Played</td><td>Season</td><td>Info</td></tr></thead><tbody>');
      const teams = [...Object.values(gc.teams)];
      // if(gc.organizations)
      //   teams.unshift({name:"Organizations",data:gc.organizations});
      teams.forEach((team)=>{
        let team_id = team.id || team.root_team_id;
        if(team.proxy_team_id)
          team_id = `${team_id}&proxy=${team.proxy_team_id}`;
        res.write(`<tr><td><a href="?team=${team_id}">${team.name}</a></td>`);
        let events = [];
        if(team.schedule&&Array.isArray(team.schedule))
          events = team.schedule.filter((s)=>s.event?.start?.datetime&&s.event.status=="scheduled"&&Date.parse(s.event.start.datetime)>Date.now());
        res.write(`<td>${events.length}</td>`);
        res.write(`<td>${team.games?.length||0}</td>`);
        res.write(`<td>${team.season_name} ${team.season_year}</td><td>`);
        res.write(`<a href="?team=${team_id}&format=json">Click for more info</a>`);
        // res.write(`<div class="info hide float biggin">${Util.tablify(team)}</div>`);
        res.write("</td></tr>");
      });
      res.write('</tbody></table></div></section>');
    }
  if(gc.organizations && Object.keys(gc.organizations).length)
    {
      res.write(`<section class="organizations"><strong class="toggleNext">My Organizations</strong><table>`);
      const orgs = [...Object.values(gc.organizations)];
      orgs.forEach((org)=>{
        res.write(`<tr><td><a href="?org=${org.id}">${org.name}</a></td>`);
        res.write(`<td>${org.season_name} ${org.season_year}</td>`);
        res.write(`<td>${org.teams?.length??0} teams</td>`);
        res.write('<td><span class="toggleNext">Info</span>');
        res.write(`<div class="info hide float biggin">${Util.tablify(org)}</div>`);
        res.write('</td></tr>');
      });
      res.write(`</table></section>`);
    }
  
  if(!gc.games?.length&&!gc.organizations&&!gc.events)
  {
    if(gc.event?.id&&gc.event.event_type=="game")
    {
      let title = "Game";
      if(gc.event.sub_type.indexOf("scrimmages")>-1)
        title = "Scrimmage";
      if(gc.pregame_data.opponent_name)
        title += " vs " + gc.pregame_data.opponent_name;
      title += " on " + Util.toLocaleDateTimeString(gc.event.start.datetime);
      res.write(`<h1>${title}</h1>`)
      let lineup = gc.config?.lineup;
      let oppoline = gc.config?.oppoline || undefined;
      if(typeof(oppoline)=="string"&&oppoline.indexOf("\n")>-1)
        oppoline = oppoline.replaceAll("\r","").split("\n").map((row)=>row.split("\t"));
      if(Array.isArray(oppoline)&&oppoline.length<7) oppoline = false;
      const tpos = gc.pregame_data?.home_away=="home"?0:1;
      if(typeof(lineup)!="object"||gc.game?.inning_positions?.length>1)
      {
        lineup = [];
        let inning_positions = [];
        if(gc.game?.inning_positions)
          inning_positions = gc.game?.inning_positions.map((ip)=>ip[tpos]);
        // console.log('Inning positions', inning_positions);
        if(gc.lineup?.length)
          lineup = gc.lineup.map((p)=>{
            let pos = p.position || "X";
            const row = [p.player.name];
            for(var inning=0;inning<6;inning++)
            {
              if(inning_positions[inning]&&typeof(inning_positions[inning][p.player_id])!="undefined")
                pos = inning_positions[inning][p.player_id] || "X";
              row.push(pos);
            }
            return row;
          });
        else if(gc.players?.length)
          lineup = gc.players.filter((p)=>p.status=="active").map((p)=>[p.name,'X','X','X','X','X','X']);
        else if(gc.team?.players?.length)
          lineup = gc.team.players.filter((p)=>p.status=="active").map((p)=>[p.name,'X','X','X','X','X','X']);
      }
      if(typeof(oppoline)!="object"&&gc.opponent?.players?.length)
      {
        oppoline = gc.opponent.players.map((p)=>[p.long_name,'X','X','X','X','X','X']);
      }
      if(gc.pregame_data.opponent_id)
        gc.game.teams.forEach((t)=>{
          if(t.id==gc.pregame_data.opponent_id)
            oppoline = t.players.map((p)=>[p.number,p.first_name,p.last_name]);
        });
      if(gc.game?.lineup?.length>1) // after start
      {
        const oteam = gc.game.getOtherTeam();
        const oplayers = oteam?.players;
        let inning_positions = [];
        if(gc.game?.inning_positions)
          inning_positions = gc.game.inning_positions.map((ip)=>ip[1-tpos]);
        if(oplayers.length>5&&gc.game.lineup[1-tpos].length>5)
        oppoline = gc.game.lineup[1-tpos].map((playerid)=>{
          const player = oplayers?.find((p)=>p.id==playerid);
          let name = playerid;
          if(player?.name)
            name = player.name;
          else if(player?.last_name)
            name = player.last_name;
          const row = [name];
          let pos = "X";
          for(var inning=0;inning<6;inning++)
          {
            if(inning_positions[inning]&&typeof(inning_positions[inning][playerid])!="undefined")
              pos = inning_positions[inning][playerid] || "X";
            row.push(pos);
          }
          return row;
        });
      }
      if(oppoline)
        oppoline.sort((a,b)=>a[1]<b[1]?-1:1);
      if(gc.stream?.game_status!="completed")
      {
        if(gc.game.events?.length)
        {
          let counts = "";
          if(gc.game.counts)
            counts = `, ${gc.game.counts.outs} outs, ${gc.game.counts.balls}-${gc.game.counts.strikes}`;
          res.write(`<div class="info">Inning: ${gc.ballSide?"Bottom":"Top"} of ${gc.game?.inning}${counts}</div>`);
        }
        const rsvp = gc.rsvp?.names;
        res.write(`<form method="POST" action="config/${gc.event.id}"><fieldset><legend class="toggleNext">Lineup Manager</legend>
          <div>
          <div class="lineups"><div class="lineup">
          <strong class="toggleNext">${gc.team.name}</strong>
          <div class="">
          <div class="rsvp" style="float:left">${rsvp?lineup.map((row)=>rsvp[row[0]]&&rsvp[row[0]][0].toUpperCase().replace("U","?")||"?").join("<br>"):""}</div>
          <textarea name="config[lineup]" class="lineup" rows="12" cols="60">${lineup.map((row)=>row.join("\t")).join("\n")}</textarea>
          <div style="clear:both"></div>
          </div>
          </div><div class="lineup">
          <strong class="toggleNext">${gc.opponent.name}</strong>
          <div class="">
          <textarea name="config[oppoline]" class="lineup" rows="12" cols="60">${oppoline.map((row)=>row.join("\t")).join("\n")}</textarea>
          </div>
          </div></div>
          <br>
          </div></fieldset>
          <fieldset><legend class="toggleNext">Automatic Functions</legend>
          <div>
          <label><input type="checkbox" name="config[positions]" value="1"${gc.config?.positions?" checked":""} />
            Auto-update positions (Above)</label><br>
          <label><input type="checkbox" name="config[stream]" value="1"${gc.config?.stream?" checked":""} />
            Auto-Stream</label>`);
          if(!gc.game.video_stream?.publish_url)
            res.write(`<span class="error">Error: Needs Video Publish URL</span>`);
          else {
            const stream_url = gc.config?.stream_url || "https://vs15.yourgamecam.com/live/montalvolittleleague/montalvolittleleague-defisher-homeplate.stream/playlist.m3u8?uid=000000";
            res.write(`&nbsp;<label>URL: <input type="text" name="config[stream_url]" size="50" value="${stream_url}" />`);
          }
          res.write(`</div>
          </fieldset>
          <input type="submit" name="command" value="Update" />
          <input type="submit" name="command" value="Send" />
          </form><br>`);
      }
      else {
        res.write(`<table cellpadding="4"><tr><td>${gc.team.name}</td><td>${gc.opponent?.name||"Opponent"}</td></tr><tr><td valign="top">`);
        res.write(`<table border="1"><thead><tr><td>Order</td><td>#</td><td>Player</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td></tr></thead><tbody>`);
        lineup.forEach((row,ord)=>{
          const name = row[0];
          const player = gc.team.players.find((p)=>p.name==name);
          res.write(`<tr><td>${ord+1}</td><td>${player.number}</td>`);
          res.write(row.map((cell)=>"<td>"+cell+"</td>").join(""));
          res.write("</tr>");
          });
        res.write(`</tbody></table>`);
        res.write('</td><td valign="top">');
        res.write(`<table border="1"><thead><tr><td>Order</td><td>Player</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td></tr></thead><tbody>`);
        res.write(`${oppoline.map((row,ord)=>`<tr><td>${ord+1}</td>`+row.map((cell)=>"<td>"+cell+"</td>").join("")+"</tr>").join("")}</tbody></table>`);
        res.write('</td></tr></table>');
      }
    }
    if(gc.game.video_stream?.publish_url)
      res.write(`<table><tr><td>Video Publish URL:</td><td><input type="text" size="50" value="${gc.game.video_stream.publish_url}" /></td></tr></table>`);

    res.write(`<strong class="toggleNext">Advanced</strong><div class="hide">`);
    res.write(Util.tablify(gc));
    res.write('</div>');
  }
  writeScripts(res);
  res.write(`<a href="/logout" class="noprint">Log Out</a>`);
  res.write(`</div></body></html>`);
  res.end();
}


function writeScripts(res) {
  res.write(`</div><style type="text/css">
    .page{margin:0 20px;}
    section{margin-bottom:20px}
    .hidden{opacity:0.5}
    .summary thead td{font-size:14pt;text-align:center;padding:1px 5px;}
    .summary tbody td{font-size:20pt;padding:1px 5px;text-align:center;}
    .summary tbody td.teamname{text-align:left;}
    .scroll{max-height:80vh;overflow-y:auto;padding:10px;display:inline-block;border:1px solid black;}
    .float{position:absolute;margin-left:20px;background-color:white;border:1px solid black;padding:5px;}
    .lineups{display:grid;}
    @media(min-width:1100px) {
    .lineups{grid-template-columns:1fr 1fr;}
    }
    .hide{display:none}
    .stats table {margin-top:10px;}
    .stats tr td:first-of-type { border-left: 1px solid #aaa; }
    .stats tr td { border-top: 1px solid black; border-right: 1px solid #000; }
    .stats table { border-bottom: 1px solid black; }
    .stats thead, .stats tfoot, .stats tbody + tbody { font-weight: bold; }
    .stats tr td:nth-of-type(even) { background-color: #eee; }
    .stats .info tr td:nth-of-type(even) { background-color: white; }
    .book td { padding: 4px; }
    .book td.block { padding: 0px; }
    .book tr:nth-of-type(even) { background-color: #eee; }
    .subs tr:nth-of-type(even), .subs tr, .info tr:nth-of-type(even) { background-color: white; }
    .subs td {border: 1px solid black;text-align:center;}
    .rsvp { padding-top: 3px; padding-right: 6px; }
    .rsvp, textarea.lineup { font-family: monospace; font-size: 16px; line-height: 1.2; text-align: center; }
    textarea.lineup { text-align: left; }
    .breakup{page-break-before:always;margin-top:20px;}
    .break{page-break-after:always;}
    .hasEvents > span { color: #000033; cursor: pointer; }
    .error{color:red;}
    a { text-decoration: none; color: #000099; }
    a:hover { text-decoration: underline; }
    td.top{border-top:4px solid black}
    .divify div { display: inline-block; }
    .item,.key { vertical-align: top; }
    .biggin{max-width:400px;max-height:300px;overflow:auto;}
    .sum { font-size: 80%; color: #333; }
    .closed > table { display: none; }
    .closed > .sum { display: inline-block; }
    </style><style type="text/css" media="print">.page{margin:0px}.noprint{display:none}</style>`);
  res.write(`<script>
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
      const rows = [...tbody.childNodes].filter((el)=>el.nodeName=="TR").map((tr)=>[...tr.childNodes].filter((el)=>el.nodeName=="TD").map((td)=>td.innerHTML));
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
      handle_clicks(tbody);
    }));
    handle_clicks(document);
    function handle_clicks(parent) {
      parent.querySelectorAll(".tablify .key,.divify .key").forEach((ktd)=>{
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
      parent.querySelectorAll('.tablify .bracket,.tablify .sum').forEach((el)=>el.addEventListener('click',()=>{
        var p = el.parentElement;
        p.classList.toggle("closed");
      }));
      parent.querySelectorAll('.toggleNext').forEach((el)=>el.addEventListener('click',()=>{el.nextElementSibling.classList.toggle('hide');}));
      parent.querySelectorAll('.togglePrev').forEach((el)=>el.addEventListener('click',()=>{el.previousElementSibling.classList.toggle('hide');})&&el.addEventListener('click',()=>{el.previousSibling.classList.toggle('hide')}));
    }
    </script>`);
}

module.exports = { writeEventHTML, writeScorebook, writeScripts, writeMain, showTotalStats, showSprayChart, showStats, getScoreHTML };
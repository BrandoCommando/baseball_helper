const { PlayerStats, PlayerStatTitles } = require("./PlayerStats");
const { Baseball, Game, Team } = require("./baseball");
const { ScoreBooks } = require("./scorebook");
const Util = require("./util");

function writeEventHTML(e, res, gc) {
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
function writeScorebook(game, res, gc) {
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
      res.write(showStats(game.player_stats, lineup, game));
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
          let block = col.plays.find((b)=>b.playerId==playerId&&!b.used&&(b?.playType||b?.pitches?.length||b?.offense=="PR"));
          if(!block&&colin==0)
            block = col.plays.find((b)=>b.row==benchPos&&!b.used);
          if(block)
          {
            block.used = true;
            if(block.pitcherId&&gc?.findData)
            {
              const pitcher = gc.findData("player", block.pitcherId);
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
        out.push(`<div class="info hide float biggin">${Util.tablify(events)}</div>`);
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
        out.push(`<div class="info hide float biggin">${Util.tablify(events)}</div>`);
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

function writeScripts(res) {
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
    .breakup{page-break-before:always;margin-top:20px;}
    .break{page-break-after:always;}
    .hasEvents > span { color: #000033; cursor: pointer; }
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
      parent.querySelectorAll('.tablify .bracket').forEach((el)=>el.addEventListener('click',()=>{
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
      parent.querySelectorAll('.toggleNext').forEach((el)=>el.addEventListener('click',()=>{el.nextElementSibling.classList.toggle('hide');}));
      parent.querySelectorAll('.togglePrev').forEach((el)=>el.addEventListener('click',()=>{el.previousElementSibling.classList.toggle('hide');})&&el.addEventListener('click',()=>{el.previousSibling.classList.toggle('hide')}));
    }
    </script>`);
}

module.exports = { writeEventHTML, writeScorebook, writeScripts, showTotalStats, showSprayChart, showStats };
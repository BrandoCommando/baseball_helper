const { PlayerStats } = require("./PlayerStats");
const { ScoreBooks } = require("./scorebook");

class baseball {
  constructor() {
    this.teams = [];
    this.players = [];
  }
}
class team {
  constructor(params) {
    if(!params) return;
    if(!params.id&&params.length&&params[0].id)
      params = params[0];
    Object.keys(params).forEach((k)=>this[k] = params[k]);
    this.id = params.id || params.event_id;
    this.players = {};
    this.games = [];
  }
  addGame(game) {
    this.games.push({
      id: game.event_id || game.id,
      teams: game.teams,
      runs: game.runs
    });
    return this;
  }
}
class game {
  constructor(params, requestor, team) {
    if(!params.id&&params.length&&params[0].id)
      params = params[0];
    this.id = params.event_id || params.id;
    this.teams = [{id:0},{id:0}];
    this.positionCodes = ["P","C","1B","2B","3B","SS","LF","CF","RF"];
    this.events = [];
    this.pitchCounts = [0,0];
    this.pitched = false;
    this.ballSide = 0;
    this.currentBatter = [0, 0];
    this.batterUp = "";
    this.allow_lineup = true;
    this.lineup = [[],[]]; // visitors, home
    this.positions = [{},{}]; // visitors, home
    this.inning_positions = [[{},{}]];
    this.counts = {"balls":0,"strikes":0,"outs":0};
    this.bases = [false,false,false,false]; // 0 = Home, 1 = 1B, 2 = 2B, 3 = 3B
    this.inning_stats = [[{runs:0,hits:0,errors:0},{runs:0,hits:0,errors:0}]];
    this.player_stats = {};
    this.runs = [0,0];
    this.inning = 0;
    this.scorebooks = new ScoreBooks();
    this.requestor = requestor;
    this.team = team;
    Object.keys(params).forEach((k)=>this[k] = params[k]);
    if(team?.id&&this.home_away)
    {
      //console.log(`wtf`, team);
      this.teams[this.home_away=="away"?0:1] = {
        id: team.id,
        name: team.name,
        players: team.players
      };
    }
  }
  recrunch() {
    if(this.events.length)
      this.events.forEach((e)=>this.check_defenders(e));
    // if(this.player_stats)
    //   Object.entries(this.player_stats).forEach((entry,i)=>{
    //     const key = entry[0];
    //     const pstat = entry[1];
    //     if(key=='0'||key=='1') return;
    //     const player = this.findPlayer(key);
    //     if(typeof(player)=="object"&&player&&player.first_name)
    //       this.player_stats[key].name = `${player.first_name} ${player.last_name}`;
    //   });
    console.log("Recrunch done");
  }
  check_defenders(event)
  {
    if(event.attributes?.defenders?.length)
      event.attributes.defenders.forEach((d,i)=>{
        if(d.playerId)
          d.player = this.getPlayerName(d.playerId);
      });
    else if(event.events?.length)
      event.events.forEach((e)=>this.check_defenders(e));
  }
  getPlayerName(playerId)
  {
    for(var team of this.teams)
    {
      if(team.players)
        for(var player of team.players)
          if(player.id == playerId) return `${player.first_name} ${player.last_name}`;
    }
    const p = this.findPlayer(playerId);
    if(typeof(p)=="object"&&!!p.first_name)
      return `${p.first_name} ${p.last_name}`;
    return undefined;
  }
  setMyTeam(team) {
    let tside = 1;
    if(this.home_away=="away")
      tside = 0;
    if(typeof(team)=="object"&&team.id)
    {
      this.teams[tside] = {id:team.id,name:team.name,players:team.players};
    }
  }
  getMyTeam() {
    return this.home_away=="home" ? this.teams[0] : this.teams[1];
  }
  getOtherTeam() {
    return this.home_away=="home" ? this.teams[1] : this.teams[0];
  }
  setOtherTeam(team) {
    let tside = 0;
    if(this.home_away=="home")
      tside = 1;
    if(typeof(team)=="object"&&team.id)
    {
      this.teams[tside] = team;
    } else console.error("Bad other team!", team);
  }
  hasOtherTeam() { return this.teams[this.home_away=="home"?1:0].id > 0; }
  resetCount(resetOuts) {
    this.counts.balls = this.counts.strikes = 0;
    if(resetOuts)
    {
      this.counts.outs = 0;
      this.ballSide = 1 - this.ballSide;
      if(this.ballSide == 0)
      {
        this.inning++;
        this.inning_stats[this.inning] = [{runs:0,hits:0,errors:0},{runs:0,hits:0,errors:0}];
        this.scorebooks.newInning();
      }
    }
  }
  advanceBase(base, event, last, parent) {
    const bstats = this.getPlayerStats(event.batterId, this.ballSide);
    if(base==0) {
      this.bases[0] = this.lineup[this.ballSide][this.currentBatter[this.ballSide]];
      bstats.battingStats.pa++;
      if(event.offense&&['BB','HP','SAC'].indexOf(event.offense)==-1)
        bstats.battingStats.ab++;
      if(event.offense=="BB")
        bstats.battingStats.bb++;
      else if(event.offense=="HP")
        bstats.battingStats.hbp++;
      else if(event.offense?.indexOf("SAC")>-1)
        bstats.battingStats.sac++;
    }
    const tpos = this.ballSide;
    if(!this.bases[base]) return;
    const runnerId = this.bases[base];
    let runnerEvent = {};
    let lastEvent = {};
    if(parent?.events?.length)
      parent.events.forEach((e)=>{
        if(e.attributes?.runnerId==runnerId) runnerEvent = e;
        if(e.code=="ball_in_play") lastEvent = e;
      });
    if(!lastEvent.code&&last?.code=="ball_in_play") lastEvent = last;
    const batterId = lastEvent?.batterId ?? event.batterId;
    const block = this.scorebooks.getCurrentBlock(this.ballSide, runnerId); // [this.ballSide][this.inning][runnerId];
    const stats = this.getPlayerStats(runnerId, this.ballSide);
    if(block.outs||block.runs) {
      console.warn("Advance after out/run?", {event,block});
      return;
    }
    if(block&&lastEvent.id&&!block.events.find((e)=>lastEvent.id==e.id))
      block.events.push(lastEvent);
    if(block&&event.id&&!block.events.find((e)=>event.id==e.id))
      block.events.push(event);
    // if(last||base>=3)
    {
      const bl = block.bases.length - 1;
      if(event.offense)
      {
        block.bases[base] = event.offense;
        if(batterId != runnerId && this.lineup[tpos].indexOf(batterId) > -1 && event.offense != "E")
          block.bases[base] += this.lineup[tpos].indexOf(batterId) + 1;
        if(event.offense=="HR"&&base<3)
          block.bases[base] = "";
        else if(event.offense=="3B")
        {
          if(base<2)
            block.bases[base] = "";
          else if(batterId != runnerId)
          {
            if(block.bases[base-1]==block.bases[base])
              block.bases[base-1] = "";
          }
        }
        else if(event.offense=="2B")
        {
          if(base < 1)
            block.bases[base] = "";
          else if(batterId != runnerId)
          {
            if(block.bases[base-1]==block.bases[base])
              block.bases[base-1] = "";
          }
        }
        else if(event.batterId!=runnerId&&event.offense=="2B"&&base<2)
          block.bases[base] = "";
      }
      else if((event.attributes?.playResult?.indexOf("sacrifice")>-1)&&this.counts.outs<2)
        block.bases[base] = "SAC";
      else if(event.attributes?.playResult?.indexOf("advance_runners")>-1&&!block.bases[base])
      {
        if(event.attributes?.playType?.indexOf("ground")>-1)
          block.bases[base] = "G";
        else if(event.attributes?.playFlavor?.indexOf("tagged_up")>-1)
          block.bases[base] = "TU";
        else if(event.attributes?.playType?.indexOf("fly")>-1)
          block.bases[base] = "F";
      }
      else if(lastEvent.attributes?.playResult?.indexOf("dropped_third_strike")>-1)
        block.bases[base] = "Kd3";
      else if(lastEvent.attributes?.playType?.indexOf("ground")>-1)
        block.bases[base] = "G";
      else if(lastEvent.offense) {
        if(lastEvent.offense=="2B"&&bl<=base)
          block.bases[base] = "";
        else
          block.bases[base] = lastEvent.offense + this.lineup[tpos].indexOf(lastEvent.batterId) + 1;
      }
    }
    if(base>=3&&!(['out_on_last_play','did_not_score','remained_on_last_play'].indexOf(runnerEvent?.attributes?.playType)>-1))
    {
      // console.log(`No runner event for ${runnerId} on ${base}?`, runnerEvent);
      this.runs[this.ballSide]++;
      this.inning_stats[this.inning][this.ballSide].runs++;
      const pitcherStats = this.getPlayerStats(this.getPosition(1-this.ballSide,'P'),1-this.ballSide);
      pitcherStats.pitchingStats.r++;
      if(!block.bases.find((b)=>typeof(b)=="string"&&b.length>0&&b.substring(0,1)=='E'))
        pitcherStats.pitchingStats.er++;
      if(event)
      {
        // if(event.playType=="ball_in_play")
        {
          if(event.batterId!=block.playerId&&event.attributes?.result!="ball")
          {
            this.getPlayerStats(event.batterId, this.ballSide).battingStats.rbi++;
            this.scorebooks.getCurrentBlock(this.ballSide, event.batterId).rbis++;
            event.rbis = (event.rbis || 0) + 1;
          }
        }
        // event.runs = this.runs[this.ballSide];
        if(event.shortResult)
          event.shortResult = `${event.shortResult.replace("G","")} | `;
        else event.shortResult = "";
        event.shortResult += this.getLongRuns();
        stats.battingStats.r++;
      }
      block.runs = this.runs[this.ballSide];
      this.bases[3] = false;
    } else {
      this.advanceBase(base + 1, event, 0, parent);
      this.bases[base+1] = runnerId;
      this.bases[base] = false;
    }
  }
  advanceBases(event,last,parent) {
    let stops = [];
    if(parent?.events.length)
      stops = parent.events.filter((e)=>['out_on_last_play','did_not_score','remained_on_last_play'].indexOf(e?.attributes?.playType)>-1);
    stops.forEach((e)=>{
      if(e.attributes.playType=="out_on_last_play")
      {
        event.attributes.runnerId = this.bases[e.attributes.base-1];
        const block = this.scorebooks.getCurrentBlock(this.ballSide, event.attributes.runnerId);
        this.counts.outs++;
        this.bases[e.attributes.base-1] = "";
        block.bases[e.attributes.base-1] = "PO";
        e.outs=this.counts.outs;
        e.handled=true;
        block.outs=this.counts.outs;
        block.events.push(e);
      }});
    if(stops.length==0)
      this.advanceBase(3,event,last,parent);
    // else
      // console.log(`STOPs: ${stops}!`, {event,events:JSON.stringify(parent.events)});
    if(stops<2)
    this.advanceBase(2,event,last,parent);
    this.advanceBase(1,event,last,parent);
  }
  clearBases() {
    this.bases[0] = this.bases[1] = this.bases[2] = this.bases[3] = false;
  }
  nextBatter(increment) {
    if(!this.pitched) return;
    if(increment) {
      this.currentBatter[this.ballSide]++;
      this.pitched = false;
    }
    if(this.currentBatter[this.ballSide]>=this.lineup[this.ballSide].length)
      this.currentBatter[this.ballSide] = 0;
    this.setBatter(
      this.bases[0] = 
      this.lineup
        [this.ballSide]
        [this.currentBatter[this.ballSide]]);
  }
  out(event) {
    if(!this.pitched) return;
    ++this.counts.outs;
    const bstats = this.getPlayerStats(event.batterId,this.ballSide);
    const pstats = this.getPlayerStats(event.pitcherId,1-this.ballSide);
    if(this.counts.outs==3)
    {
      pstats.pitchingStats.lob += this.bases.filter((b)=>typeof(b)=="string"&&b!="").length;
    }
    if(event?.batterId)
      bstats.battingStats.pa++;
    if(["ꓘ",'K'].indexOf(event.defense)>-1)
      bstats.battingStats.so++;
    const catcherId = this.getPosition(1-this.ballSide,'C');
    if(event.defense=="ꓘ")
    {
      bstats.battingStats.kl++;
    }
    if(['K','ꓘ'].indexOf(event.defense)>-1)
    {
      this.getPlayerStats(catcherId||(1-this.ballSide),1-this.ballSide).catchingStats.po++;
    }
    const dlen = event.attributes?.defenders?.length ?? 0;
    if(dlen>0)
      event.attributes?.defenders?.forEach((d,i)=>{
        const defenderId = this.getPosition(1-this.ballSide, d.position) || (1-this.ballSide);
        d.playerId = defenderId;
        const dstats = this.getPlayerStats(defenderId,1-this.ballSide);
        if(dstats.name != defenderId && dstats.name.indexOf("Other (")==-1)
          d.player = dstats.name;
        d.putout = i == dlen - 1;
        d.assisted = i > 0;
        if(event.attributes.extendedPlayResult=="double_play")
        {
          d.double_play = true;
          d.putout = i >= dlen - 2;
        } else if(event.attributes.extendedPlayResult=="triple_play")
        {
          d.triple_play = true;
          d.puout = i >= dlen - 3;
        }
        dstats.fielding_play(event, d);
      });
    this.resetCount(false);
    this.nextBatter(true);
  }
  getRunnerBase(runnerId) {
    for(let i=0;i<=3;i++)
      if(runnerId == this.bases[i])
        return i;
    return false;
  }
  walk(event) {
    if(event?.batterId)
    {
      const block = this.scorebooks.getCurrentBlock(this.ballSide, event.batterId);
      if(block) {
        block.events.push(event);
        block.pitcherId = this.getPosition(!this.ballSide, 'P');
      }
    }
    if(event?.pitcherId)
    {
      const pstats = this.getPlayerStats(event.pitcherId,1-this.ballSide).pitchingStats;
      if(event.offense=="HP")
        pstats.hbp++;
      else
        pstats.bb++;
    }
    this.advanceBase(0,event,1);
    this.resetCount();
    this.nextBatter(true);
  }
  getTeamPos(teamId) {
    if(this.teams[0].id==teamId)
      return 0;
    if(this.teams[1].id==teamId)
      return 1;
    return -1;
  }
  getLineupNames() {
    const ret = [[],[]];
    for(var side=0;side<=1;side++)
      for(var pos=0;pos<this.lineup[side].length;pos++)
        ret[side][pos] = this.findPlayer(this.lineup[side][pos]);
    return ret;
  }
  processGame(events)
  {
    this.processEvent(events);
    this.endGame();
  }
  endGame() {
    Object.values(this.player_stats).forEach((ps)=>{
      if(ps.batters_faced?.length)
      {
        // console.log(`RELIEF! ${ps.name} / Inning: ${this.inning} / ${this.counts.outs}`, ps.pitchingStats);
        ps.relieve(this.inning, this.counts.outs);
      }
    });
  }
  processEvent(event, parent) {
    if(Array.isArray(event))
    {
      // console.log("Processing " + event.length + " events");
      const events = [];
      const _events = [];
      for(var i=0;i<event.length;i++)
      {
        if(typeof(event[i].event_data)=="string")
          event[i].event_data = JSON.parse(event[i].event_data);
        if(!event[i].sequence_number&&parent?.sequence_number)
          event[i].sequence_number = parent.sequence_number;
        if(!event[i].sequence_id&&parent?.sequence_id)
          event[i].sequence_id = parent.sequence_id;
        if(event[i].event_data?.code=="delete")
        {
          event[i].event_data.deleteIds.forEach((delId)=>{
            let found = false;
            _events.forEach((e,ind)=>{
              if(found) return;
              if(e.event_data?.id==delId||e.id==delId)
              {
                found = true;
                _events.splice(ind, 1);
              }
              if(!found&&e.event_data?.events?.length)
                e.event_data.events.forEach((ee,eind)=>{
                  if(ee.id==delId)
                  {
                    found = true;
                    e.event_data.events.splice(eind, 1);
                  }
                });
            });
            if(!found)
              console.warn(`Unable to find ${delId}`);
            _events.push(event[i]);
          });
        } else if(event[i].event_data?.code=="edit_group")
        {
          event[i].event_data.events.forEach((editevent)=>{
            const replaceWith = [];
            if(editevent.events)
              editevent.events.forEach((repEvent)=>replaceWith.push(repEvent));
            if(editevent.code=="insert"&&editevent.beforeId)
            {
              const ei = _events.findIndex((e)=>e.id==editevent.beforeId||e.event_data?.id==editevent.beforeId||e.events?.find((ee)=>ee.id==editevent.beforeId));
              if(ei>-1)
                _events.splice(ei,0,replaceWith);
              else console.warn(`Unable to insert before ${editevent.beforeId} in ${_events.length} events: ${JSON.stringify(_events[16])}`);
            }
            if(editevent.deleteIds)

              editevent.deleteIds.forEach((delId,dind)=>{
                let found = false;
                _events.forEach((e,ind)=>{
                  if(found) return;
                  if(e.event_data?.id==delId||e.id==delId)
                  {
                    found = true;
                    _events.splice(ind, 1, replaceWith);
                  }
                  if(!found&&e.event_data?.events?.length)
                    e.event_data.events.forEach((ee,eind)=>{
                      if(ee.id==delId)
                      {
                        editevent.parent_number = e.sequence_number;
                        console.log(`Replacement of ${delId} on Event ${e.id}`, {"before":JSON.stringify(ee), "after":JSON.stringify(replaceWith[dind])});
                        found = true;
                        replaceWith.forEach((re)=>{
                          if(!re.event_data)
                            re.event_data = {...re};
                        });
                        e.event_data.events.splice(eind, 1, replaceWith);
                        // while(replaceWith.length>0)
                        //   e.event_data.events.push(replaceWith.splice(0,1));
                      }
                    });
                });
                if(!found)
                  console.warn(`Unable to replace ${delId}`);
              });
          });
          _events.push(event[i]);
        } else
          _events.push(event[i]);
      }
      const undos = [];
      for(i=0;i<_events.length;i++)
        if(_events[i].event_data?.code=="undo")
          undos.push(events.pop());
        else if(_events[i].event_data?.code=="redo")
          events.push(undos.pop());
        else if(_events[i].code=="modify_event")
        {
          const event = _events[i];
          const event_id = event.event_id;
          let found = false;
          _events[i].forEach((e)=>{
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
        } else
        {
          // if(typeof(_events[i].event_data)=="string")
          //   _events[i].event_data = JSON.parse(_events[i].event_data);
          events.push(_events[i]);
        }
      for(i=0;i<events.length;i++)
      {
        if(!parent)
          parent = {events:[],count:events.length};
          // if(i>0)
          //   parent.events.push(events[i-1]);
          if(i<events.length-1)
          {
            parent.peek = [];
            for(var j=i+1;j<events.length;j++)
              if(events[j].event_data?.code=="base_running")
                parent.peek.push({sequence_id: events[j].id, sequence_number: events[j].sequence_number, ...events[j].event_data});
              else break;
          }
        this.processEvent(events[i], parent);
      }
      return this;
    }
    if(!event.sequence_number&&!!parent?.sequence_number)
    {
      event.sequence_number = parent.sequence_number;
      event.sequence_id = parent.serquence_id;
    }
    if(!event.code)
    {
      if(typeof event.event_data == "string")
        event.event_data = JSON.parse(event.event_data);
      if(event.event_data)
      {
        return this.processEvent({sequence_id: event.id, sequence_number: event.sequence_number, ...event.event_data}, parent);
      }
      console.warn("Unable to find event_data");
      return false;
    }
    let tpos = this.ballSide;
    if(event.attributes?.teamId) tpos = this.getTeamPos(event.attributes.teamId);
    if(tpos == -1) console.error("Bad team pos", {event, teams:this.teams});
    event.home = !!tpos;
    switch(event.code)
    {
      case "set_teams":
        if(!this.allow_lineup) break;
        this.resetCount();
        this.counts.outs = 0;
        this.currentBatter = [0,0];
        this.pitchCounts[0] = this.pitchCounts[1] = this.ballSide = 0;
        this.bases[0] = this.bases[1] = this.bases[2] = this.bases[3] = false;
        if(this.teams[1].id == event.attributes.awayId || this.teams[0].id == event.attributes.homeId)
        {
          const swap = this.teams.shift();
          this.teams.push(swap);
        }
        if(this.teams[0].id != event.attributes.awayId)
        {
          this.teams[0] = {id: event.attributes.awayId};
        }
        if(this.teams[1].id != event.attributes.homeId)
        {
          this.teams[1] = {id: event.attributes.homeId};
        }
        event.hidden = true;
        break;
      case "fill_lineup":
        this.lineup[tpos].push(event.attributes.playerId);
        event.hidden = true;
        break;
      case "fill_lineup_index":
        this.lineup[tpos]
          [event.attributes.index] = event.attributes.playerId;
          event.hidden = true;
          break;
      case "reorder_lineup":
        if(!this.allow_lineup) return;
        let i = 0;
        const playerId = this.lineup[tpos][event.attributes.fromIndex];
        event.attributes.fromPlayerId = playerId;
        event.attributes.toPlayerId = this.lineup[tpos][event.attributes.toIndex];
        // event.attributes.fromPlayer = this.findPlayer(playerId);
        // const toPlayerId = this.lineup[tpos][event.attributes.toIndex];
        // const fromBlock = this.scorebooks.getCurrentBlock(tpos, fromPlayerId, 1);
        // const toBlock = this.scorebooks.getCurrentBlock(tpos, toPlayerId, 1);
        // if(toBlock)
        {
          // const fromPlayer = this.lineup[tpos][event.attributes]
          // console.log(`Switching ${JSON.stringify(toBlock)} to ${playerId}`);
          // toBlock.playerId = playerId;

        }
        if(event.attributes.toIndex<event.attributes.fromIndex)
        {
          for(i=event.attributes.fromIndex;i>event.attributes.toIndex;i--)
          {
            // this.scorebooks.changePlayerByRow(tpos, i, this.lineup[tpos][i - 1]);
            this.lineup[tpos][i] = this.lineup[tpos][i - 1];
          }
        }
        else {
          for(i=event.attributes.fromIndex;i<event.attributes.toIndex;i++)
          {
            // this.scorebooks.changePlayerByRow(tpos, i, this.lineup[tpos][i + 1]);
            this.lineup[tpos][i] = this.lineup[tpos][i + 1];
          }
        }
        // this.scorebooks.changePlayerByRow(tpos, event.attributes.toIndex, playerId);
        // this.scorebooks.changeRow(tpos, event.attributes.toIndex, event.attributes.fromIndex, playerId);
        this.lineup[tpos][event.attributes.toIndex] = playerId;
        event.hidden = true;
        break;
      case "transaction":
        // if(event.events.length>3&&event.events[0].code=='pitch')
        //   console.log("trans 3+", event);
        this.processEvent(event.events, event, 1);
        return;
      case "goto_lineup_index":
        this.currentBatter
          [tpos]
          = event.attributes.index;
        event.hidden = true;
        break;
      case "undo":
        console.error("Undo should not be here", event);
        break;
      case "place_runner":
        this.bases[event.attributes.base] = event.attributes.runnerId;
        const block = this.scorebooks.getCurrentBlock(tpos, event.attributes.runnerId);
        block.bases[0] = block.bases[1] = block.offense = "PR";
        break;
      case "clear_position_by_id":
        const atpos = this.teams.findIndex((t)=>t.id==event.attributes.teamId);
        if(this.positions[atpos][event.attributes.playerId])
          this.positions[atpos][event.attributes.playerId] = "";
        // else
        //   console.warn(`Not sure what to do: ${atpos} ${event.attributes.playerId}`, this.positions[atpos]);
        event.hidden = true;
        break;
      case "squash_lineup_index":
        this.lineup[tpos].splice(event.attributes.index,1);
        if(this.currentBatter[tpos]==event.attributes.index)
          this.currentBatter[tpos] = event.attributes.index % this.lineup[tpos].length;
        console.log(`New lineup (${this.currentBatter[tpos]})`, this.lineup[tpos]);
        event.hidden = true;
        break;
      case "confirm_end_of_lineup":
        this.currentBatter[tpos] = 0;
        event.hidden = true;
        break;
      case "clear_lineup_index":
        // this.lineup
        //   [tpos]
        //   [event.attributes.index] = false;
        event.hidden = true;
        break;
      case "clear_all_positions":
        this.positions[tpos] = {};
        event.hidden = true;
        break;
      case "clear_entire_lineup":
        this.lineup[tpos] = [];
        event.hidden = true;
        break;
      case "fill_position":
        const oldPlayerId = this.getPosition(tpos, event.attributes.position);
        const myPlayerStats = this.getPlayerStats(event.attributes.playerId, tpos);
        if(oldPlayerId != event.attributes.playerId && this.positions[tpos][event.attributes.playerId] != event.attributes.position)
        {
          if(event.attributes.position=="P")
          {
            console.log(`New pitcher: ${event.attributes.playerId} in for ${oldPlayerId}`);
            if(oldPlayerId)
              this.getPlayerStats(oldPlayerId, tpos).relieve(this.inning, this.counts.outs);
            myPlayerStats.putOnMound(this.inning, this.counts.outs);
            this.pitchCounts[tpos] = 0;
          }
          else if(event.attributes.position!="C")
            event.hidden = true;
          this.positions[tpos][oldPlayerId] = "";
          this.positions
            [tpos]
            [event.attributes.playerId] = event.attributes.position;
          if(!this.inning_positions[this.inning])
            this.inning_positions[this.inning] = [];
          if(!this.inning_positions[this.inning][tpos])
            this.inning_positions[this.inning][tpos] = {};
          this.inning_positions[this.inning][tpos][event.attributes.playerId] = event.attributes.position;
        }
        break;
      case "sub_players":
        const teamId = event.attributes.teamId;
        if(this.teams[0].id==teamId)
          tpos = 0;
        else tpos = 1;
        let pos = this.lineup[tpos].findIndex((p)=>p==event.attributes.outgoingPlayerId);
        if(pos>-1)
          this.lineup[tpos][pos] = event.attributes.incomingPlayerId;
        const fpos = this.positions[tpos][event.attributes.outgoingPlayerId];
        if(fpos)
        {
          this.positions[tpos][event.attributes.incomingPlayerId] = fpos;
          delete this.positions[tpos][event.attributes.outgoingPlayerId];
        }
        break;
      case "balk":
        event.batterId = this.lineup[tpos][this.currentBatter[tpos]];
        this.advanceBases(event,1);
        break;
      case "pitch":
        this.handlePitch(event, parent);
        break;
      case "ball_in_play":
        this.handleBallInPlay(event, parent);
        break;
      case "base_running":
        // event.batterId = this.lineup[tpos][this.currentBatter[tpos]]
        this.handleBaseRunning(event,parent);
        break;
      case "end_half":
        this.clearBases();
        this.resetCount(true);
        break;
      case "end_at_bat":
        event.batterId = this.lineup[tpos][this.currentBatter[tpos]];
        switch(event.attributes.reason){
          case 'catcher_interference':
            event.offense = event.playResult = "CI";
            this.walk(event);
            break;
          case 'hit_by_pitch':
            event.offense = event.playResult = "HP";
            this.walk(event);
            break;
          case 'walk':
            event.offense = event.playResult = "BB";
            this.walk(event);
            break;
          default:
            console.warn(`Unhandled end_at_bat: ${event.attributes.reason}`);
        }
        this.resetCount(false);
        break;
      case "override":
        if(event.attributes?.scores?.length)
          event.attributes.scores.forEach((overscore)=>{
            this.runs[this.getTeamPos(overscore.teamId)] = overscore.score;
          });
        break;
      case "pitcher_decision": // ignore blows/saves
        event.hidden = true;
        break;
      case "undo":
      case "delete":
      case "edit_group":
        break;
      case "modify_event":
        
        break;
      default:
        console.warn(`New event code: ${event.code}`, JSON.stringify(event));
    }
    event.snapshotJ = this.getSnapshotJSON();
    if(event.attributes?.playResult)
      event.playResult = event.attributes.playResult;
    event.snapshot = this.getSnapshot();
    // console.log("%s\t%s\t%s\t%s", event.code, event.attributes)
    /*
    if(event.playResult)
      console.log(this.getShortResult(event) + ": " + this.getSnapshot());
    else
      console.log("   " + this.getShortEvent(event)) + ": " + this.getSnapshot();
    */
    if(event.playResult)
      event.shortResult = this.getShortResult(event);
    // if(event.defense&&this.scorebook[tpos][this.inning][event.batterId])
    //   this.scorebook[tpos][this.inning][event.batterId].defense = event.defense;
    if(event.compactorAttributes)
      delete event.compactorAttributes;
    if(!event.attributes)
      event.attributes = {};
    this.events.push(event);
    if(this.counts.outs >= 3)
    {
      this.resetCount(true);
      this.clearBases();
    }
  }
  getPosition(home, pos) {
    const positions = this.positions[home ? 1 : 0];
    if(!positions) return false;
    for(var playerId in positions)
      if(positions[playerId]==pos) return playerId;
    return false;
  }
  handlePitch(event, parent) {
    const tpos = event.home ? 1 : 0;
    event.batterId = this.lineup[tpos][this.currentBatter[tpos]];
    event.pitcherId = this.getPosition(event.home ? 0 : 1, "P");
    if(!this.pitched)
      this.scorebooks.batterUp(tpos, event.batterId, false, this.currentBatter[tpos]);
    const bstats = this.getPlayerStats(event.batterId,this.ballSide);
    const pstats = this.getPlayerStats(event.pitcherId||(1-this.ballSide),1-this.ballSide);
    const cstats = this.getPlayerStats(this.getPosition(1-this.ballSide,'C')||(1-this.ballSide),1-this.ballSide);
    this.pitched = true;
    const block = this.scorebooks.getCurrentBlock(tpos, event.batterId);
    this.pitchCounts[1-tpos]++;
    bstats.battingStats.ps++;
    // if(event.attributes?.advancesCount)
    {
      if(event.attributes.playResult&&!event.handled)
      {
        let playHandled = false;
        if(event.attributes.playResult.indexOf("out")>-1)
        {
          playHandled = true;
          this.out(event);
          event.outs = this.counts.outs;
          if(event.attributes.playResult.indexOf("advance_runners")>-1)
          {
            this.advanceBases(event,1,parent);
          }
        }
        switch(event.attributes.playResult)
        {
          case 'dropped_third_strike_batter_out':
            // this.getPlayerStats(event.pitcherId).strikeouts++;
            break;
          default:
            console.warn(`New playResult: ${event.attributes.playResult} (${playHandled})`);
        }
      }
      if(event.attributes?.result=="ball")
      {
        block.pitches.push("B");
        bstats.battingStats.tbs++;
        if((block.balls=++this.counts.balls)>=4)
        {
          if(!(parent&&parent.events&&parent.events.find((e)=>e.attributes.reason=="hit_by_pitch")))
          {
            event.playResult = event.offense = "BB";
            this.walk(event);
          }
        }
      }
      else if(event.attributes.result == "foul")
      {
        if(block.strikes==2)
          bstats.battingStats.tf2++;
        bstats.battingStats.tf++;
        block.pitches.push("F");
        if(this.counts.strikes<3 && event.attributes.advancesCount) {
          this.counts.strikes++;
          block.strikes = this.counts.strikes;
        }
      }
      else if(event.attributes?.result!="ball_in_play")
      {
        if(event.attributes.result.indexOf("strike")>-1)
        {
          if(event.attributes.result.indexOf("swing")==-1)
            bstats.battingStats.tsl++;
          else bstats.battingStats.tsw++;
        }
        if(event.attributes.advancesCount&&(this.counts.strikes<=2||event.attributes.result.indexOf("strike")>-1))
        {
          this.counts.strikes++;
          if(event.attributes.result.indexOf("looking")>-1)
          {
            block.pitches.push("L");
          } else
            block.pitches.push("S");
          block.strikes = this.counts.strikes;
        }
        if(this.counts.strikes>=3)
        {
          if(event.attributes.result.indexOf("swinging")==-1)
          {
            event.playResult = event.defense = "ꓘ";
          }
          else event.playResult = event.defense = "K";
          block.pitcherId = this.getPosition(!tpos, 'P');
          block.defense = event.playResult;
          if(!event.attributes.playResult)
            event.attributes.playResult = event.playResult;
          if(!(parent?.events?.find((e)=>e.attributes?.playResult=="dropped_third_strike")))
          {
            this.out(event);
            event.outs = this.counts.outs;
            block.outs = event.outs;
            if(block.outs==3) block.last = true;
          }
        }
      }
    }
    pstats.pitch(event, this.inning);
    cstats.catchingStats["#C"]++;
  }
  
  /**
   * 
   * @param {String} playerId 
   * @returns {PlayerStats}
   */
  getPlayerStats(playerId, side) {
    if(typeof(side)=="boolean"&&!side) side = 0;
    if(side=="false") side = 0;
    if(!playerId&&typeof(side)!="undefined"&&!this.player_stats[side])
      playerId = side;
    if(!this.player_stats[playerId])
    {
      let name = "?";
      const player = this.findPlayer(playerId);
      if(typeof(player)=="object"&&player.first_name)
        name = `${player.first_name} ${player.last_name}`;
      else if(this.teams.length>=side)
        name = `Other (${this.teams[side].name})`;
      else
        name = `Other`;
      this.player_stats[playerId] = new PlayerStats(name);
    }
    this.player_stats[playerId].playerId = playerId;
    return this.player_stats[playerId];
  }
  handleBallInPlay(event, parent) {
    const tpos = event.home ? 1 : 0;
    event.batterId = this.lineup[tpos][this.currentBatter[tpos]];
    const block = this.scorebooks.getCurrentBlock(tpos, event.batterId);
    const playerStats = this.getPlayerStats(event.batterId, tpos);
    block.pitcherId = this.getPosition(!tpos, 'P');
    const pitcherStats = this.getPlayerStats(block.pitcherId, 1-tpos);
    block.playType = event.attributes.playType;
    if(event.attributes.playResult=='home_run')
      this.handleHomeRun(event);
    if(event.attributes.defenders?.length&&event.attributes.playResult!="dropped_third_strike_batter_out")
      block.location = [
        Math.round(event.attributes.defenders[0].location.x),
        Math.round(event.attributes.defenders[0].location.y)
      ];
    block.events.push(event);
    if(['single','double','triple','home_run'].indexOf(event.attributes.playResult)>-1)
    {
      this.inning_stats[this.inning][this.ballSide].hits++;
      pitcherStats.pitchingStats.h++;
    }
    switch(event.attributes.playResult)
    {
      case "sacrifice_bunt":
      case "sacrifice_fly":
        event.offense = "SAC";
        block.bases[0] = "SAC";
      case "batter_out_advance_runners":
        this.out(event);
        event.outs = this.counts.outs;
        this.bases[0] = false;
        let scored = false;
        if(this.counts.outs<3)
        {
          if(this.bases[3])
          {
            scored = true;
          }
          this.advanceBases(event,1,parent);
        }
        block.outs = event.outs;
        if(block.outs==3) block.last = true;
        if(event.shortResult)
          event.shortResult += " | ";
        else event.shortResult = "";
        event.shortResult += this.getLongOuts();
        block.defense = this.getOutCode(event,parent);
        break;
      case "fielders_choice":
        event.offense = "FC";
        // if(this.outs<2)
        this.advanceBases(event,false,parent);
        this.advanceBase(0,event,1,parent);
        break;
      case "infield_fly":
      case "other_out":
      case "batter_out":
      case "dropped_third_strike_batter_out":
      case "offensive_interference":
        this.out(event);
        event.outs = this.counts.outs;
        event.shortResult = this.getLongOuts();
        block.defense = this.getOutCode(event,parent);
        block.outs = event.outs;
        this.bases[0] = false;
        break;
      case "dropped_third_strike":
        event.offense = "Kd3";
        const catcherId = this.getPosition(1-tpos,'C');
        this.getPlayerStats(catcherId||(1-tpos)).catchingStats.kd3++;
        console.log(`Kd3 on ${catcherId}`);
        this.advanceBase(0,event,0,parent);
        break;
      case "error":
        if(!this.inning_stats[this.inning])
          this.inning_stats[this.inning] = [];
        if(!this.inning_stats[this.inning][1-this.ballSide])
          this.inning_stats[this.inning][1-this.ballSide] = {runs:0,hits:0,errors:0};
        this.inning_stats[this.inning][1-this.ballSide].errors++;
        const dlen = event.attributes?.defenders?.length ?? 0;
        if(dlen>0)
          event.attributes?.defenders?.forEach((d,i)=>{
          if(d.playerId) return;
          const defenderId = this.getPosition(1-this.ballSide, d.position);
          if(!defenderId) return;
          d.playerId = defenderId;
          const dstats = this.getPlayerStats(defenderId, 1-this.ballSide);
          if(dstats.name != defenderId)
            d.player = dstats.name;
          if(d.error)
            dstats.fielding_error();
        });
        event.offense = "E";
        this.advanceBases(event,false,parent);
        this.advanceBase(0,event,1,parent);
        break;
      case "single":
        event.offense = "1B";
        this.advanceBases(event,false,parent);
        this.advanceBase(0,event,1,parent);
        break;
      case "double":
        event.offense = "2B";
        this.advanceBases(event,false,parent);
        this.advanceBase(0,event,0,parent);
        this.advanceBases(event,true,parent);
        break;
      case "triple":
        event.offense = "3B";
        this.advanceBases(event,false,parent);
        this.advanceBase(0,event,0,parent);
        this.advanceBases(event,false,parent);
        if(!(parent&&parent.events&&parent.events.find((e)=>e.code=='base_running'&&e.attributes?.playType=='remained_on_last_play')))
        this.advanceBases(event,true,parent);
        break;
      case "home_run":
        event.offense = "HR";
        this.advanceBases(event,false,parent);
        this.advanceBase(0,event,0,parent);
        this.advanceBases(event,false,parent);
        this.advanceBases(event,false,parent);
        this.advanceBases(event,true,parent);
        break;
      default:
        console.log(`New ball_in_play playResult: ${event.attributes.playResult}`);
    }
    event.counts = {...this.counts};
    if(event.attributes?.defenders?.length)
      event.defenderId = this.getPosition(1-this.ballSide, event.attributes.defenders[0].position);
    if(event.defense)
    {
      block.defense = event.defense;
      if(event.defenderId)
        event.defender = this.getPlayerName(event.defenderId);
      if(event.attributes.defenders?.length)
        event.position = event.attributes.defenders[0].position;
    }
    if(!event.pitcherId)
      event.pitcherId = this.getPosition(1-this.ballSide, 'P');
    event.pitcher = this.getPlayerName(event.pitcherId);
    if(!event.batterId)
      event.batterId = this.lineup[1-this.ballSide][this.currentBatter[1-this.ballSide]];
    event.player = this.getPlayerName(event.batterId);
    playerStats.ball_in_play({...event, gameId: this.id, streamId: this.game_stream?.id, opponentId: this.teams[1-this.ballSide].id});
    this.resetCount();
    this.nextBatter(true);
  }
  handleBaseRunning(event,parent) {
    if(event.handled) return;
    const tpos = event.home ? 1 : 0;
    if(event.attributes.runnerId == this.lineup[tpos][this.currentBatter[tpos]])
    {
      if(event.attributes.base&&this.bases[event.attributes.base-1])
        event.attributes.runnerId = this.bases[event.attributes.base-1];
      else console.warn(`Still bad runner: ${event.attributes.runnerId}`, {event,bases:this.bases});
    } else if(this.bases[event.attributes.base-1] && event.attributes.runnerId != this.bases[event.attributes.base-1])
    {
      // console.warn('Bad runner?', {event,bases:this.bases});
      event.attributes.runnerId = this.bases[event.attributes.base-1];
    }
    const block = this.scorebooks.getCurrentBlock(tpos, event.attributes.runnerId);
    const stats = this.getPlayerStats(event.attributes.runnerId, this.ballSide);
    const pitcherStats = this.getPlayerStats(this.getPosition(1-tpos, 'P')||1-this.ballSide, 1-this.ballSide);
    const catcherStats = this.getPlayerStats(this.getPosition(1-tpos, 'C')||1-this.ballSide, 1-this.ballSide);
    if(block.outs||block.runs) {
      console.warn("Base running after out?", block);
      return;
    }
    switch(event.attributes.playType)
    {
      case 'attempted_pickoff':
        return true;
      case 'stole_base':
        event.offense = "SB";
        stats.battingStats.sb++;
        catcherStats.catchingStats.sb++;
        pitcherStats.pitchingStats.sb++;
        break;
      case 'wild_pitch':
        event.offense = "WP";
        stats.battingStats.wp++;
        pitcherStats.pitchingStats.wp++;
        break;
      case 'passed_ball':
        event.offense = "PB";
        stats.battingStats.pb++;
        catcherStats.catchingStats.pb++;
        break;
      case 'caught_stealing':
        event.offense = "CS";
        stats.battingStats.cs++;
        if(event?.attributes?.defenders?.length)
        {
          const dlen = event.attributes.defenders.length;
          event.attributes.defenders.forEach((d,di)=>{
            if(di == dlen - 1)
            {
              if(d.position=='C')
                catcherStats.catchingStats.ccs++;
              else if(event.attributes.defenders[event.attributes.defenders.length-1].position=='P')
                pitcherStats.pitchingStats.cs++;
              else this.getPlayerStats(this.getPosition(d.position, 1-this.ballSide)||(1-this.ballSide)).fieldingStats.cs++;
            } else this.getPlayerStats(this.getPosition(d.position, 1-this.ballSide)||(1-this.ballSide)).fieldingStats.a++;
          });
        }
        break;
      case 'advanced_on_error':
        event.offense = "E";
        this.inning_stats[this.inning][1-tpos].errors++;
        break;
    }
    let lastPos = this.events.length - 1;
    let lastEvent = this.events[lastPos];
    while(lastEvent.code=="base_running")
    {
      lastPos--;
      lastEvent = this.events[lastPos];
    }
    const lastBlock = this.scorebooks.getCurrentBlock(tpos, lastEvent.batterId);
    switch(event.attributes.playType)
    {
      case 'advanced_on_last_play':
        if(event.attributes?.playFlavor?.indexOf("tagged_up")>-1)
        {
          const peek = parent.peek;
          // console.log("tag up", {peek:JSON.stringify(parent.peek)});
          // if(event.attributes.base==4||!(peek?.event_data?.attributes?.playFlavor?.indexOf("tagged_up")>-1))
          block.bases[event.attributes.base-1] = "TU";
          if(peek.find((e)=>e?.attributes?.runnerId==event.attributes.runnerId&&e.attributes.playFlavor=="tagged_up"))
            block.bases[event.attributes.base-1] = "";
        }
        // else
        //   block.bases[event.attributes.base-1] = lastEvent.offense ?? "SB";
        if(event.attributes.base==4)
        {
          this.getPlayerStats(lastEvent.playerId, this.ballSide).battingStats.rbi++;
          if(lastEvent.rbis)
            lastEvent.rbis++;
          else lastEvent.rbis = 1;
          lastBlock.rbis++;
          // block.runs = event.runs = ++this.runs[tpos];
        }
        // block.bases[event.attributes.base-2] = "";
        // break;
      case 'other_advance':
      case 'defensive_indifference':
      case 'stole_base':
      case 'wild_pitch':
      case 'passed_ball':
      case 'advanced_on_error':
        this.advanceBase(event.attributes.base-1,event,1,parent);
        break;
      case 'other_out':
      case 'out_on_appeal':
      case 'out_on_last_play':
      case 'caught_stealing':
      case 'picked_off':
        event.outs = ++this.counts.outs;
        if(event.defense)
          block.defense = event.defense;
        // console.log("Defense?", {event,block});
        block.outs = event.outs;
        if(event.runs) {
          this.runs[this.ballSide]--;
          this.inning_stats[this.inning][this.ballSide]--;
          event.runs = 0;
        } else if(lastEvent.runs) {
          this.runs[this.ballSide]--;
          this.inning_stats[this.inning][this.ballSide]--;
          lastEvent.runs = 0;
          if(lastEvent.rbis)
            lastEvent.rbis--;
        }
        if(block.runs) block.runs = 0;
        if(event.attributes.playType=="caught_stealing")
          block.bases[event.attributes.base-1] = "CS";
        else if(event.attributes.playType=="picked_off")
          block.bases[event.attributes.base] = "PO";
        else if(event.attributes.playType=="out_on_last_play")
        {
          if(lastEvent?.attributes?.extendedPlayResult?.indexOf("double_play")>-1)
            block.bases[event.attributes.base] = "DP";
          else if(lastEvent?.attributes?.extendedPlayResult?.indexOf("triple_play")>-1)
            block.bases[event.attributes.base] = "TP";
          else if(event.attributes.playFlavor=="doubled_off")
            block.bases[event.attributes.base] = "DP";
          else if(["fielders_choice"].indexOf(lastEvent?.attributes?.playResult)==-1)
            block.bases[event.attributes.base-1] = "PO";
          else if(parent?.events?.find((e)=>e.attributes?.playResult=="fielders_choice"))
            block.bases[event.attributes.base] = "FC";
        }
        else if(event.attributes.playType=="out_on_appeal")
          block.bases[event.attributes.base-1] = "OOA";
        else if(lastEvent.attributes?.extendedPlayResult?.indexOf("double")>-1||event.attributes?.playFlavor?.indexOf("double")>-1)
          block.bases[event.attributes.base] = "DP";
        else if(lastEvent.offense=="1B")
          block.bases[event.attributes.base-1] = "1B";
        else if(lastEvent.offense)
          block.bases[event.attributes.base-1] = lastEvent.offense;
        if(typeof(lastEvent?.shortResult)=="string")
          lastEvent.shortResult = lastEvent.shortResult.replace("SAC","");
        if(typeof(lastEvent?.offense)=="string")
          lastEvent.offense = lastEvent.offense.replace("SAC","");
        if(typeof(lastEvent?.defense)=="string")
          lastEvent.defense = lastEvent.defense.replace("SAC","");
        let defenders = "";
        if(event.attributes?.defenders?.length)
          defenders = this.getOutCode(event,parent);
        else if(event.attributes?.base)
          defenders = this.getOutCode({position:`${event.attributes.base}B`});
        else if(lastEvent?.attributes?.defenders?.length)
          event.offense = defenders = this.getOutCode(lastEvent,parent);
        if(defenders)
            event.shortResult = (event.shortResult ? event.shortResult+" | ":"")
        // if(lastEvent?.attributes?.extendedPlayResult=="double_play")
        //   event.shortResult += "DP";
        if(defenders)
          event.shortResult += defenders;
        event.shortResult += " | " + this.getLongOuts();
        block.events.push(event);
        let base = this.getRunnerBase(event.attributes.runnerId);
        if(typeof(event.attributes.base)!="undefined")
          base = event.attributes.base;
        // console.log(`Out on ${base}B: ${event.attributes.runnerId} => `+this.bases.join("->"));
        this.bases[base] = false;
        break;
      case 'did_not_score':
        console.log("roll back", lastEvent);
        if(lastEvent.runs)
        {
          this.runs[this.ballSide]--;
          this.inning_stats[this.inning][this.ballSide].runs--;
        }
        lastEvent.runs = 0;
        if(lastEvent.rbis)
          lastEvent.rbis--;
        break;
      case 'remained_on_last_play':
        if(event.attributes.base&&this.bases[event.attributes.base+1])
        {
          this.bases[event.attributes.base] = this.bases[event.attributes.base+1];
          this.bases[event.attributes.base+1] = "";
          const block = this.scorebooks.getCurrentBlock(tpos, this.bases[event.attributes.base], 1);
          if(block?.bases)
          {
            let old = block.bases[event.attributes.base];
            if(old=="3B"&&event.attributes.base==2)
            {
              old = block.offense = "2B";
            }
            block.bases[event.attributes.base-1] = old;
            block.bases[event.attributes.base] = "";
          }
        }
        // console.log('Walk off?', lastEvent);
        break;
      default:
        this.advanceBase(event.attributes.base-1,event,1,parent);
        console.warn(`New base_running playType: ${event.attributes.playType}`);
    }
  }
  handleHomeRun(event) {
    const defender = {"error":false,"location":{"x":0,"y":0},"position":''};
    switch(event.attributes.hrLocation){
      case 'right_field':
        defender.position = 'RF';
        defender.location.x = 320;
        defender.location.y = 40;
        break;
      case 'left_field':
        defender.position = 'LF';
        defender.location.x = 10;
        defender.location.y = 40;
        break;
      case 'center_field':
        defender.position = 'CF';
        defender.location.x = 160;
        defender.location.y = -20;
        break;
      default:
        console.warn(`New HR location: ${event.attributes.hrLocation}`);
    }
    event.attributes.defenders.push(defender);
  }
  getShortEvent(event) {
    if(event.code == "pitch")
    {
      if(event.attributes.result == "ball")
        return "Ball " + this.counts.balls;
      else if(event.attributes.result.indexOf("strike") > -1)
        return "Strike " + this.counts.strikes;
      else return event.attributes.result;
    } else return event.code;
  }
  getLongOuts() {
    return this.counts.outs + " Out" + (this.counts.outs > 1 ? "s" : "");
  }
  getLongRuns() {
    const sides = [];
    sides[0] = this.getShortTeamName(this.getTeamName(this.teams[0])) + " " + this.runs[0];
    sides[1] = this.getShortTeamName(this.getTeamName(this.teams[1])) + " " + this.runs[1];
    return sides.join(" - ");
  }
  getTeamName(team) {
    if(!team.name&&team.id&&this.team&&team.id==this.team.id)
      return this.team.name;
    else if(!!team.name)
      return team.name;
    else return "To Be Determined";
  }
  getShortTeamName(name) {

    if(typeof(name)=="object"&&!!name.name) return this.getShortTeamName(name.name);
    let words = name.split(" ").filter((s)=>s!=s.toUpperCase()&&s!="Major");
    if(words.length>2)
      return words.map((w)=>w[0]).join('');
    if(words.length==2)
      return words[0][0] + words[1].substring(0,3);
    if(words.length==1)
      return words[0].replace(/[AEIOU]/gi, "").substring(0,5);
    var short = name.toUpperCase().replace(/[AEIOU]/g, "");
    if(short.length > 4) short = short.substring(0, 4);
    return short;
  }
  getOutCode(event,parent) {
    // event.outs = this.counts.outs;
    if(event.error) {
      return "E" + this.getOutCode({...event,error:false},parent);
    }
    if(event.position)
    {
      let posPos = this.positionCodes.indexOf(event.position);
      if(posPos>-1)
        return posPos + 1;
      else return event.position;
    } else if(event.attributes?.defenders?.length)
    {
      event.defense = "";
      if(event.attributes?.extendedPlayResult?.indexOf("double")>-1)
        event.defense = "DP";
      else if(event.attributes?.playType)
      {
        if(event.attributes.playType=="line_drive")
          event.defense = "L";
        else if(event.attributes.playType.indexOf("fly")>-1)
          event.defense = "F";
        else if(event.attributes.playType.indexOf("ground">-1))
          event.defense = "G";
      }
      event.defense += event.attributes.defenders.reduce((play,pos)=>{
        play.push(this.getOutCode(pos));
        return play;
      }, []).join("-");
      if(event.attributes.playResult=="dropped_third_strike_batter_out")
        return `K${event.defense}`;
      return event.defense;
    } else if(event.length) // defenders
      return event.reduce((play,pos)=>{
        play.push(this.getOutCode(pos));
        return play;
      }, []).join("-");
    return "";
  }
  getShortResult(event) {
    
    let defenders = false;
    if(event.attributes?.defenders?.length)
      defenders = this.getOutCode(event);
    let short = this.getShortPlayResult(event, defenders);
    return short;
  }
  getShortPlayResult(event, defenders) {
    if(!event.playResult) return "";
    const block = this.scorebooks.getCurrentBlock(this.ballSide, event.batterId);
    switch (event.playResult)
    {
      case "double_play":
        return "DP";
      case "home_run":
        block.offense = "HR";
        return event.offense = "HR";
      case "triple":
        block.offense = "3B";
        return event.offense = "3B";
      case "double":
        block.offense = "2B";
        return event.offense = "2B";
      case "single":
        block.offense = "1B";
        return event.offense = "1B";
      case "error":
        block.offense = "E";
        return event.offense = "E";
      case "CI":
      case "HP":
      case "BB":
        block.offense = event.playResult;
        event.offense = event.playResult;
        return event.playResult;
      case "infield_fly":
      case "batter_out":
        return defenders + " | " + this.getLongOuts();
      case "sacrifice_bunt":
        block.bases[1] == "SAC";
      case "sacrifice_fly":
        block.offense = "SAC";
      case "batter_out_advance_runners":
        event.defense = `SAC${defenders}`;
        if((this.bases[1]||this.bases[2]||this.bases[3])&&this.counts.outs<2)
        {
          event.offense = `SAC`;
          if(typeof(defenders)=="number")
            event.offense += defenders;
          else if(typeof(defenders)=="string")
            event.offense += defenders.replace("G","").replace("L","");
          else
            console.warn("Bad defenders", defenders);
        } else event.offense = event.defense;
        if(event.shortResult) event.shortResult = `${event.offense} | ${event.shortResult}`;
        else event.shortResult = event.defense;
        return event.shortResult;
      case "fielders_choice":
        block.offense = event.offense = "FC";
        block.bases[0] = event.offense;
        return "FC";
      case "ꓘ":
      case "K":
        return event.playResult + " | " + this.getLongOuts();
      case "dropped_third_strike":
        event.offense = block.offense = "Kd3";
        block.defense = "";
        return "Kd3";
      case "dropped_third_strike_batter_out":
        block.bases[0] = "K";
        block.offense = "Kd3";
        block.defense = "K3";
        return "K3 | " + this.getLongOuts();
      case "offensive_interference":
        return "OI" + defenders.replace("U","");
      default:
        console.error(`Unknown short playResult: ${event.playResult}`);
        return event.playResult;
    }
  }
  hasRunner(base) {
    if(!this.bases[base]) return 0;
    return 1;
  }
  getRunner(base) {
    if(base==0) return this.findPlayer(this.lineup[this.ballSide][this.currentBatter[this.ballSide]]);
    if(!this.bases[base]) return false;
    return this.findPlayer(this.bases[base]);
  }
  getSnapshot() {
    return this.runs.join(":") + " " +
      (this.ballSide === 0 ? "T" : "B") + (this.inning+1) + " " +
      this.counts.balls + "-" + this.counts.strikes + "-" + this.counts.outs +
      " " + (this.hasRunner(1) ? "1" : "_") + (this.hasRunner(2) ? "2" : "_") + (this.hasRunner(3) ? "3" : "_") +
      " " + this.pitchCounts.join(":");
  }
  getSnapshotJSON() {
    return {
      score: { home: this.runs[0], away: this.runs[1] },
      inning: { side: this.ballSide === 0 ? "Top" : "Bottom", which: this.inning },
      count: this.counts,
      bases: { first: this.getRunner(1), second: this.getRunner(2), third: this.getRunner(3) },
      batter: this.findPlayer(this.batterId)
    };
  }
  setBatter(playerId)
  {
    if(typeof(playerId)=="undefined")
    {
      const playerInLineup = this.lineup[this.ballSide][this.currentBatter[this.ballSide]];
      if(playerInLineup)
        return this.setBatter(playerInLineup);
      else {
        console.warn(`Bad batter (${this.currentBatter[this.ballSide]})`);
        return false;
      }
    }
    const player = this.findPlayer(playerId);
    if(player?.long_name)
      this.batterUp = player.long_name;
    else if(player?.first_name)
      this.batterUp = player.first_name;
    else
      this.batterUp = `Batter #${this.currentBatter[this.ballSide]+1}`;
  }
  findPlayer(id)
  {
    if(typeof(id)=="object"&&id&&id.first_name) return id;
    let found = false;
    for(var team of this.teams)
    {
      if(team?.players)
        for(var player of team.players)
          if(player.id==id)
          {
            found = player;
            break;
          }
      if(found) break;
    }
    if(!found&&!!this.requestor)
    {
      found = this.requestor("player", id);
    }
    if(!found) return id;
    let long = "";
    if(found.number)
      long = `#${found.number} `;
    if(found.first_name&&found.last_name)
      long = `${long}${found.first_name} ${found.last_name}`;
    else if(found.first_name)
      long = `${long}${found.first_name}`;
    else if(found.last_name)
      long = `${long}${found.last_name}`;
    if(!!long)
      found.long_name = long;
    return found;
  }
}
module.exports = {Baseball:baseball,Team:team,Game:game};
const { ScoreBook } = require("./scorebook");

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
    this.lineup = [[],[]]; // visitors, home
    this.positions = [{},{}]; // visitors, home
    this.counts = {"balls":0,"strikes":0,"outs":0};
    this.bases = [false,false,false,false]; // 0 = Home, 1 = 1B, 2 = 2B, 3 = 3B
    this.runs = [0,0];
    this.inning = 0;
    this.scorebook = new ScoreBook();
    this.requestor = requestor;
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
      this.teams[tside] = {id:team.id,name:team.name,players:team.players};
    }
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
        this.scorebook.newInning();
      }
    }
  }
  advanceBase(base, event, last) {
    if(base==0) {
      this.bases[0] = this.lineup[this.ballSide][this.currentBatter[this.ballSide]];
    }
    if(!this.bases[base]) return;
    const runnerId = this.bases[base];
    const block = this.scorebook.getCurrentBlock(this.ballSide, runnerId); // [this.ballSide][this.inning][runnerId];
    // if(last||base>=3)
    {
      if(event.offense)
      {
        block.bases[base] = event.offense;
        if(event.offense=="HR"&&base<3)
          block.bases[base] = "";
        else if(event.offense=="3B"&&base<2)
          block.bases[base] = "";
        else if(event.offense=="2B"&&base<1)
          block.bases[base] = "";
      }
      else if(event.attributes?.playResult?.indexOf("advance_runners")>-1)
        block.bases[base] = "SAC";
    }
    if(base>=3)
    {
      this.runs[this.ballSide]++;
      if(event)
      {
        if(event.playType=="ball_in_play")
        {
          this.scorebook.getCurrentBlock(this.ballSide, event.batterId).rbis++;
          event.rbis = (event.rbis || 0) + 1;
        }
        event.runs = this.runs[this.ballSide];
        if(event.shortResult)
          event.shortResult = `SAC${event.shortResult} | `;
        else event.shortResult = "";
        event.shortResult += this.getLongRuns();
      }
      block.runs = this.runs[this.ballSide];
      this.bases[3] = false;
    } else {
      this.advanceBase(base + 1, event);
      this.bases[base+1] = runnerId;
      this.bases[base] = false;
    }
  }
  advanceBases(event,last) {
    this.advanceBase(3,event,last);
    this.advanceBase(2,event,last);
    this.advanceBase(1,event,last);
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
  out() {
    if(!this.pitched) return;
    ++this.counts.outs;
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
        if(event[i].event_data?.code=="delete")
        {
          event[i].event_data.deleteIds.forEach((delId)=>{
            const ind = _events.findIndex((e)=>e.event_data.id==delId||e.id==delId||(e.event_data?.events?.length&&e.event_data.events.find((ee)=>ee.id==delId)));
            if(ind>=0)
              _events.splice(ind, 1);
            else console.warn(`Unable to find ${delId}`);
          });
        } else
          _events.push(event[i]);
      }
      for(i=0;i<_events.length;i++)
        if(_events[i].event_data?.code=="undo")
          events.pop();
        else
          events.push(_events[i]);
      for(i=0;i<events.length;i++)
        this.processEvent(events[i], parent);
      return this;
    }
    if(!event.sequence_number&&!!parent?.sequence_number)
      event.sequence_number = parent.sequence_number;
    if(!event.code)
    {
      if(typeof event.event_data == "string")
        event.event_data = JSON.parse(event.event_data);
      if(event.event_data)
      {
        return this.processEvent({sequence_id: event.id, sequence_number: event.sequence_number, ...event.event_data});
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
        let i = 0;
        const playerId = this.lineup[tpos][event.attributes.fromIndex];
        if(event.attributes.toIndex<event.attributes.fromIndex)
        {
          for(i=event.attributes.fromIndex;i>event.attributes.toIndex;i--)
            this.lineup[tpos][i] = this.lineup[tpos][i - 1];
        }
        else {
          for(i=event.attributes.fromIndex;i<event.attributes.toIndex;i++)
            this.lineup[tpos][i] = this.lineup[tpos][i + 1];
        }
        this.lineup[tpos][event.attributes.toIndex] = playerId;
        event.hidden = true;
        break;
      case "transaction":
        if(event.events)
          this.processEvent(event.events, event);
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
        const block = this.scorebook.getCurrentBlock(tpos, event.attributes.runnerId);
        block.bases[0] = block.bases[1] = block.offense = "PR";
        break;
      case "clear_position_by_id":
      case "squash_lineup_index":
        console.warn('Not sure what to do', event);
        event.hidden = true;
        break;
      case "confirm_end_of_lineup":
        this.currentBatter[tpos] = 0;
        event.hidden = true;
        break;
      case "clear_lineup_index":
        this.lineup
          [tpos]
          [event.attributes.index] = false;
        event.hidden = true;
        break;
      case "clear_all_positions":
        this.positions = [{},{}];
        event.hidden = true;
        break;
      case "clear_entire_lineup":
        this.lineup = [[],[]];
        event.hidden = true;
        break;
      case "fill_position":
        if(event.attributes.position=="P")
          this.pitchCounts[tpos] = 0;
        this.positions
          [tpos]
          [event.attributes.playerId] = event.attributes.position;
        event.hidden = true;
        break;
      case "balk":
        event.batterId = this.lineup[tpos][this.currentBatter[tpos]];
        this.advanceBases(event,1);
        break;
      case "pitch":
        this.handlePitch(event);
        break;
      case "ball_in_play":
        this.handleBallInPlay(event);
        break;
      case "base_running":
        // event.batterId = this.lineup[tpos][this.currentBatter[tpos]]
        this.handleBaseRunning(event);
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
  handlePitch(event) {
    const tpos = event.home ? 1 : 0;
    event.batterId = this.lineup[tpos][this.currentBatter[tpos]];
    if(!this.pitched)
      this.scorebook.batterUp(tpos, event.batterId);
    this.pitched = true;
    const block = this.scorebook.getCurrentBlock(tpos, event.batterId);
    this.pitchCounts[1-tpos]++;
    // if(event.attributes?.advancesCount)
    {
      if(event.attributes.playResult)
      {
        let playHandled = false;
        if(event.attributes.playResult.indexOf("out")>-1)
        {
          playHandled = true;
          this.out();
          event.outs = this.counts.outs;
          if(event.attributes.playResult.indexOf("advance_runners")>-1)
          {
            this.advanceBases(event,1);
          }
        }
        switch(event.attributes.playResult)
        {
          case 'dropped_third_strike_batter_out':
            break;
          default:
            console.log(`New playResult: ${event.attributes.playResult} (${playHandled})`);
        }
      }
      if(event.attributes?.result=="ball")
      {
        block.pitches.push("B");
        if((block.balls=++this.counts.balls)>=4)
        {
          event.playResult = event.offense = "BB";
          this.walk(event);
        }
      }
      else if(event.attributes.result == "foul")
      {
        block.pitches.push("F");
        if(this.counts.strikes<3 && event.attributes.advancesCount) {
          this.counts.strikes++;
          block.strikes = this.counts.strikes;
        }
      }
      else if(event.attributes?.result!="ball_in_play")
      {
        if(event.attributes.advancesCount&&(this.counts.strikes<=2||event.attributes.result.indexOf("strike")>-1))
        {
          this.counts.strikes++;
          block.pitches.push("S");
          block.strikes = this.counts.strikes;
        }
        if(this.counts.strikes>=3)
        {
          if(event.attributes.result.indexOf("swinging")==-1)
            event.playResult = "ꓘ";
          else event.playResult = "K";
          block.defense = event.playResult;
          if(!event.attributes.playResult)
            event.attributes.playResult = event.playResult;
          this.out();
          event.outs = this.counts.outs;
          block.outs = event.outs;
          if(block.outs==3) block.last = true;
        }
      }
    }
  }
  handleBallInPlay(event) {
    const tpos = event.home ? 1 : 0;
    event.batterId = this.lineup[tpos][this.currentBatter[tpos]];
    const block = this.scorebook.getCurrentBlock(tpos, event.batterId);
    block.playType = event.attributes.playType;
    if(event.attributes.defenders?.length)
      block.location = [
        Math.round(event.attributes.defenders[0].location.x),
        Math.round(event.attributes.defenders[0].location.y)
      ];
    switch(event.attributes.playResult)
    {
      case "batter_out_advance_runners":
        this.out();
        event.outs = this.counts.outs;
        this.bases[0] = false;
        let scored = false;
        if(this.counts.outs<3)
        {
          if(this.bases[3])
            scored = true;
          this.advanceBases(event,1);
        }
        block.outs = event.outs;
        if(block.outs==3) block.last = true;
        if(event.shortResult)
          event.shortResult += " | ";
        else event.shortResult = "";
        event.shortResult += this.getLongOuts();
        block.defense = this.getOutCode(event);
        break;
      case "fielders_choice":
        this.advanceBases(event);
        this.advanceBase(0,event,1);
        break;
      case "other_out":
      case "batter_out":
      case "dropped_third_strike_batter_out":
      case "offensive_interference":
        this.out();
        event.outs = this.counts.outs;
        event.shortResult = this.getLongOuts();
        block.defense = this.getOutCode(event);
        block.outs = event.outs;
        this.bases[0] = false;
        break;
      case "dropped_third_strike":
        event.offense = "Kd3";
        this.advanceBase(0,event);
        break;
      case "single":
        event.offense = "1B";
        this.advanceBases(event);
        this.advanceBase(0,event,1);
        break;
      case "double":
        event.offense = "2B";
        this.advanceBases(event);
        this.advanceBase(0,event);
        this.advanceBases(event,1);
        break;
      case "triple":
        event.offense = "3B";
        this.advanceBases(event);
        this.advanceBase(0,event);
        this.advanceBases(event);
        this.advanceBases(event,1);
        break;
      case "home_run":
        event.offense = "HR";
        this.advanceBases(event);
        this.advanceBase(0,event);
        this.advanceBases(event);
        this.advanceBases(event);
        this.advanceBases(event,1);
        break;
      default:
        console.log(`New ball_in_play playResult: ${event.attributes.playResult}`);
    }
    if(event.defense)
      block.defense = event.defense;
    this.resetCount();
    this.nextBatter(true);
  }
  handleBaseRunning(event) {
    const tpos = event.home ? 1 : 0;
    if(event.attributes.runnerId == this.lineup[tpos][this.currentBatter[tpos]])
    {
      if(event.attributes.base&&this.bases[event.attributes.base-1])
        event.attributes.runnerId = this.bases[event.attributes.base-1];
      else console.warn(`Still bad runner: ${event.attributes.runnerId}`, {event,bases:this.bases});
    }
    const block = this.scorebook.getCurrentBlock(tpos, event.attributes.runnerId);
    switch(event.attributes.playType)
    {
      case 'attempted_pickoff':
        return true;
      case 'stole_base':
        event.offense = "SB";
        break;
      case 'wild_pitch':
        event.offense = "WP";
        break;
      case 'passed_ball':
        event.offense = "PB";
        break;
      case 'caught_stealing':
        event.offense = "CS";
        break;
      case 'advanced_on_error':
        event.offense = "E";
        break;
    }
    const lastEvent = this.events[this.events.length-1];
    switch(event.attributes.playType)
    {
      case 'advanced_on_last_play':
        block.bases[event.attributes.base-1] = lastEvent.offense;
      case 'other_advance':
      case 'defensive_indifference':
      case 'stole_base':
      case 'wild_pitch':
      case 'passed_ball':
      case 'advanced_on_error':
        this.advanceBase(event.attributes.base-1,event,1);
        break;
      case 'out_on_appeal':
      case 'out_on_last_play':
      case 'caught_stealing':
      case 'picked_off':
        event.outs = ++this.counts.outs;
        block.outs = event.outs;
        if(event.runs) {
          this.runs[this.ballSide]--;
          event.runs = 0;
        } else if(lastEvent.runs) {
          this.runs[this.ballSide]--;
          lastEvent.runs = 0;
          if(lastEvent.rbis)
            lastEvent.rbis--;
        }
        if(block.runs) block.runs = 0;
        if(event.attributes.playType=="caught_stealing")
          block.bases[event.attributes.base-1] = "CS";
        else if(event.attributes.playType=="picked_off")
          block.bases[event.attributes.base] = "PO";
        else if(event.attributes.playType=="out_on_appeal")
          block.bases[event.attributes.base-1] = "OOA";
        else if(lastEvent.attributes?.extendedPlayResult?.indexOf("double")>-1||event.attributes?.playFlavor?.indexOf("double")>-1)
          block.bases[event.attributes.base-1] = "DP";
        else if(lastEvent.offense=="1B")
          block.bases[event.attributes.base-1] = "FC";
        else if(lastEvent.offense)
          block.bases[event.attributes.base-1] = lastEvent.offense;
        if(lastEvent?.shortResult)
          lastEvent.shortResult = lastEvent.shortResult.replace("SAC","");
        if(lastEvent?.offense)
          lastEvent.offense = lastEvent.offense.replace("SAC","");
        if(lastEvent?.defense)
          lastEvent.defense = lastEvent.defense.replace("SAC","");
        let defenders = "";
        if(event.attributes?.defenders?.length)
          defenders = this.getOutCode(event);
        else if(lastEvent?.attributes?.defenders?.length)
          event.offense = defenders = this.getOutCode(lastEvent);
        if(defenders)
            event.shortResult = (event.shortResult ? event.shortResult+" | ":"")
        if(lastEvent?.attributes?.extendedPlayResult=="double_play")
          event.shortResult += "DP";
        if(defenders)
          event.shortResult += defenders;
        event.shortResult += " | " + this.getLongOuts();

        let base = this.getRunnerBase(event.attributes.runnerId);
        if(base===false&&typeof(event.attributes.base)!="undefined")
          base = event.attributes.base;
        // console.log(`Out on ${base}B: ${event.attributes.runnerId} => `+this.bases.join("->"));
        this.bases[base] = false;
        break;
      case 'remained_on_last_play':
        break;
      default:
        this.advanceBase(event.attributes.base-1,event,1);
        console.warn(`New base_running playType: ${event.attributes.playType}`);
    }
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
    sides[0] = this.getShortTeamName(this.teams[0]) + " " + this.runs[0];
    sides[1] = this.getShortTeamName(this.teams[1]) + " " + this.runs[1];
    return sides.join(" - ");
  }
  getShortTeamName(team) {
    if(!team.name) return "TBD";
    var short = `${team.name}`.toUpperCase().replace(/[AEIOU]/g, "");
    if(short.length > 4) short = short.substring(0, 4);
    return short;
  }
  getOutCode(event) {
    // event.outs = this.counts.outs;
    if(event.error) {
      return "E" + this.getOutCode({...event,error:false});
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
      if(event.attributes?.playFlavor?.indexOf("double")>-1)
        event.defense = "DP";
      if(event.attributes.defenders.length==1)
      {
        if(event.attributes?.playType)
        {
          if(event.attributes.playType=="line_drive")
            event.defense = "L" + this.getOutCode(event.attributes.defenders[0]);
          else if(event.attributes.playType.indexOf("fly")>-1)
            event.defense = "F" + this.getOutCode(event.attributes.defenders[0]);
        }
        if(!event.defense)
          event.defense = this.getOutCode(event.attributes.defenders[0]) + "U";
      } else
        event.defense += event.attributes.defenders.reduce((play,pos)=>{
          play.push(this.getOutCode(pos));
          return play;
        }, []).join("-");
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
    const block = this.scorebook.getCurrentBlock(this.ballSide, event.batterId);
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
      case "CI":
      case "HP":
      case "BB":
        block.offense = event.playResult;
        event.offense = event.playResult;
        return event.playResult;
      case "batter_out":
        return defenders + " | " + this.getLongOuts();
      case "batter_out_advance_runners":
        if(this.bases[1]||this.bases[2]||this.bases[3])
        {
          event.offense = event.defense = `SAC${defenders}`;
        } else
          event.defense = `${defenders}`;
        if(event.shortResult) event.shortResult = `${event.defense} | ${event.shortResult}`;
        else event.shortResult = event.defense;
        return event.shortResult;
      case "fielders_choice":
        event.offense = "FC";
        block.bases[0] = event.offense;
        return "FC";
      case "ꓘ":
      case "K":
        return event.playResult + " | " + this.getLongOuts();
      case "dropped_third_strike":
        return "Kd3";
      case "dropped_third_strike_batter_out":
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
    if(typeof(id)=="object") return id;
    let found = false;
    for(var team in this.teams)
    {
      if(team?.players)
        for(var player in team.players)
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
      long = `${out}${found.first_name} ${found.last_name}`;
    else if(found.first_name)
      long = `${out}${found.first_name}`;
    else if(found.last_name)
      long = `${out}${found.last_name}`;
    if(!!long)
      found.long_name = long;
    return found;
  }
}
module.exports = {Baseball:baseball,Team:team,Game:game};
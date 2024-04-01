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
    this.id = params.id;
    this.players = {};
    this.games = [];
  }
  addGame(game) {
    this.games.push({
      id: game.id,
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
    this.id = params.id;
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
    this.scorebook = [[{}],[{}]]; // side, inning, playerId
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
  setOtherTeam(team) {
    let tside = 0;
    if(this.home_away=="home")
      tside = 1;
    if(typeof(team)=="object"&&team.id)
    {
      this.teams[tside] = {id:team.id,name:team.name,players:team.players};
    }
  }
  resetCount(resetOuts) {
    this.counts.balls = this.counts.strikes = 0;
    if(resetOuts)
    {
      this.counts.outs = 0;
      this.ballSide = 1 - this.ballSide;
      if(this.ballSide == 0)
        this.inning++;
    }
  }
  advanceBase(base, event, last) {
    if(base==0&&!this.bases[base]) {
      this.bases[0] = this.lineup[this.ballSide][this.currentBatter[this.ballSide]];
    }
    if(!this.bases[base]) return;
    const runnerId = this.bases[base];
    const scoreBlock = this.scorebook[this.ballSide][this.inning][runnerId];
    if(!scoreBlock.bases)
    	scoreBlock.bases = [];
    if(event&&(last||base==3))
	    scoreBlock.bases[base] = event.offense;
    if(base>=3)
    {
      this.runs[this.ballSide]++;
      if(event)
      {
      	this.scorebook[this.ballSide][this.inning][event.batterId].rbis = 
      		(this.scorebook[this.ballSide][this.inning][event.batterId].rbis || 0) + 1;
        event.rbis = (event.rbis || 0) + 1;
        event.runs = this.runs[this.ballSide];
        if(event.shortResult)
          event.shortResult = `SAC${event.shortResult} | `;
        else event.shortResult = "";
        event.shortResult += this.getLongRuns();
      }
      scoreBlock.runs = this.runs[this.ballSide];
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
        [this.currentBatter]);
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
  prepareScorebook(event) {
    if(!this.scorebook[this.ballSide])
      this.scorebook[this.ballSide] = [];
    if(!this.scorebook[this.ballSide][this.inning])
      this.scorebook[this.ballSide][this.inning] = {};
    if(!this.scorebook[this.ballSide][this.inning][event.batterId])
      this.scorebook[this.ballSide][this.inning][event.batterId] = {"pitches":[],"strikes":0,"balls":0};
  }
  processEvent(event, parent) {
    if(Array.isArray(event))
    {
      // console.log("Processing " + event.length + " events");
      const events = [];
      for(var i=0;i<event.length;i++)
      {
        if(typeof(event[i].event_data)=="string")
          event[i].event_data = JSON.parse(event[i].event_data);
        if(event[i].event_data?.code!="undo")
          events.push(event[i]);
        else events.pop();
      }
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
    switch(event.code)
    {
      case "set_teams":
        this.resetCount();
        this.counts.outs = 0;
        this.currentBatter = [0,0];
        this.pitchCounts[0] = this.pitchCounts[1] = this.ballSide = 0;
        this.bases[0] = this.bases[1] = this.bases[2] = this.bases[3] = false;
        if(this.teams[0].id != event.attributes.awayId)
        {
          if(this.teams[0].id)
            console.warn("Away team reset", {from: this.teams[0], to: event.attributes.awayId});
          if(this.teams[1].id == event.attributes.awayId)
          {
            const swap = this.teams.shift();
            this.teams.push(swap);
          } else
            this.teams[0] = {id: event.attributes.awayId};
        }
        if(this.teams[1].id != event.attributes.homeId)
        {
          if(this.teams[1].id)
            console.warn("Home team reset", {from:this.teams[1],to:event.attributes.homeId});
          if(this.teams[0].id == event.attributes.homeId)
          {
            const swap = this.teams.shift();
            this.teams.push(swap);
          } else
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
        this.pitched = true;
        event.batterId = this.lineup[tpos][this.currentBatter[tpos]];
        this.prepareScorebook(event);
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
            this.scorebook[this.ballSide][this.inning][event.batterId].pitches.push("B");
            if((this.scorebook[this.ballSide][this.inning][event.batterId].balls=++this.counts.balls)>=4)
            {
              event.playResult = "BB";
              this.walk(event);
            }
          }
          else if(event.attributes.result == "foul")
          {
            this.scorebook[this.ballSide][this.inning][event.batterId].pitches.push("F");
            if(this.counts.strikes<3 && event.attributes.advancesCount) {
              this.counts.strikes++;
              this.scorebook[this.ballSide][this.inning][event.batterId].strikes = this.counts.strikes;
            }
          }
          else if(event.attributes?.result!="ball_in_play")
          {
            if(event.attributes.advancesCount&&(this.counts.strikes<=2||event.attributes.result.indexOf("strike")>-1))
            {
              this.counts.strikes++;
              this.scorebook[this.ballSide][this.inning][event.batterId].pitches.push("S");
              this.scorebook[this.ballSide][this.inning][event.batterId].strikes = this.counts.strikes;
            }
            if(this.counts.strikes>=3)
            {
              if(event.attributes.result.indexOf("swinging")==-1)
                event.playResult = "ꓘ";
              else event.playResult = "K";
              this.scorebook[this.ballSide][this.inning][event.batterId].defense = event.playResult;
              if(!event.attributes.playResult)
                event.attributes.playResult = event.playResult;
              this.out();
              event.outs = this.counts.outs;
              this.scorebook[this.ballSide][this.inning][event.batterId].outs = event.outs;
            }
          }
        }
        break;
      case "ball_in_play":
        event.batterId = this.lineup[tpos][this.currentBatter[tpos]];
        this.prepareScorebook(event);
        this.scorebook[this.ballSide][this.inning][event.batterId].playType = event.attributes.playType;
        if(event.attributes.defenders?.length)
          this.scorebook[this.ballSide][this.inning][event.batterId].location = [
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
            this.scorebook[this.ballSide][this.inning][event.batterId].outs = event.outs;
            if(event.shortResult)
              event.shortResult += " | ";
            else event.shortResult = "";
            event.shortResult += this.getLongOuts();
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
            if(event.defense)
              this.scorebook[this.ballSide][this.inning][event.batterId].defense = event.defense;
            this.scorebook[this.ballSide][this.inning][event.batterId].outs = event.outs;
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
          this.scorebook[this.ballSide][this.inning][event.batterId].defense = event.defense;
        this.resetCount();
        this.nextBatter(true);
        break;
      case "base_running":
        // event.batterId = this.lineup[tpos][this.currentBatter[tpos]]
        switch(event.attributes.playType)
        {
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
        }
        switch(event.attributes.playType)
        {
          case 'advanced_on_last_play':
          case 'other_advance':
          case 'defensive_indifference':
          case 'stole_base':
          case 'wild_pitch':
          case 'passed_ball':
            if(event.attributes.runnerId == this.lineup[tpos][this.currentBatter[tpos]])
            {
              if(event.attributes.base&&this.bases[event.attributes.base-1])
                event.attributes.runnerId = this.bases[event.attributes.base-1];
              else console.warn(`Still bad runner: ${event.attributes.runnerId}`, {event,bases:this.bases});
            }
            this.advanceBase(event.attributes.base-1,event,1);
            break;
          case 'out_on_last_play':
          case 'caught_stealing':
            this.pitched = true;
            this.out();
            event.outs = this.counts.outs;
            const lastEvent = this.events[this.events.length-1];
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
    if(event.defense&&this.scorebook[tpos][this.inning][event.batterId])
      this.scorebook[tpos][this.inning][event.batterId].defense = event.defense;
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
    switch (event.playResult)
    {
      case "double_play":
        return "DP";
      case "home_run":
        this.scorebook[this.ballSide][this.inning][event.batterId].offense = "HR";
        return event.offense = "HR";
      case "triple":
        this.scorebook[this.ballSide][this.inning][event.batterId].offense = "3B";
        return event.offense = "3B";
      case "double":
        this.scorebook[this.ballSide][this.inning][event.batterId].offense = "2B";
        return event.offense = "2B";
      case "single":
        this.scorebook[this.ballSide][this.inning][event.batterId].offense = "1B";
        return event.offense = "1B";
      case "CI":
      case "HP":
      case "BB":
        this.scorebook[this.ballSide][this.inning][event.batterId].offense = event.playResult;
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
        // console.warn(`Bad batter (${this.currentBatter[this.ballSide]})`);
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
  getScoreHTML(block) {
    var marks = "";
    let pspot = [0,0];
    if(block.pitches.length)
      block.pitches.forEach((pitch,num)=>{
        let y = 81.383;
        let xi = 0;
        if(pitch=="B")
        {
          y = 89.167;
          xi = pspot[1]++;
          if(xi>=3) return;
        } else {
          xi = pspot[0]++;
          if(xi>=2) return;
        }
        let x = 93 - (xi * 7.784);
        marks += `<text xml:space="preserve" x="${x}" y="${y}" transform="translate(-13.749 -30.811)"><tspan style="font-weight:700;font-size:8px;font-family:Arial;fill:#000;stroke:none;" x="${x}" y="${y}">${num+1}</tspan></text>`;
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
    const base1 = `<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1" d="m60 85 15-15" transform="translate(-13.749 -30.811)"/>`;
    const base2 = `<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1" d="m60 85 15-15-15-15" transform="translate(-13.749 -30.811)"/>`;
    const base3 = `<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1" d="m60 85 15-15-15-15-15 15" transform="translate(-13.749 -30.811)"/>`;
    const base4 = `<path style="fill:#4d4d4d;stroke:#000;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1" d="m60 85 15-15-15-15-15 15 15 15z" transform="translate(-13.749 -30.811)"/>`;
    if(block.offense=="BB")
      marks += `${base1}<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round" d="M28.574 38.48a6.953 5.623 0 0 1-6.952 5.623 6.953 5.623 0 0 1-6.953-5.623 6.953 5.623 0 0 1 6.953-5.624 6.953 5.623 0 0 1 6.952 5.624z" transform="translate(-13 -30.811)"/>`;
    if(block.offense=="1B")
      marks += `${base1}<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round" d="M28.574 38.48a6.953 5.623 0 0 1-6.952 5.623 6.953 5.623 0 0 1-6.953-5.623 6.953 5.623 0 0 1 6.953-5.624 6.953 5.623 0 0 1 6.952 5.624z" transform="translate(-13 -19.811)"/>`;
    if(block.offense=="2B")
      marks += `${base2}<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round" d="M28.574 38.48a6.953 5.623 0 0 1-6.952 5.623 6.953 5.623 0 0 1-6.953-5.623 6.953 5.623 0 0 1 6.953-5.624 6.953 5.623 0 0 1 6.952 5.624z" transform="translate(-13 -8.811)"/>`;
    if(block.offense=="3B")
      marks += `${base3}<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round" d="M28.574 38.48a6.953 5.623 0 0 1-6.952 5.623 6.953 5.623 0 0 1-6.953-5.623 6.953 5.623 0 0 1 6.953-5.624 6.953 5.623 0 0 1 6.952 5.624z" transform="translate(-13 2.189)"/>`;
    if(block.offense=="HR")
      marks += `${base4}<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round" d="M28.574 38.48a6.953 5.623 0 0 1-6.952 5.623 6.953 5.623 0 0 1-6.953-5.623 6.953 5.623 0 0 1 6.953-5.624 6.953 5.623 0 0 1 6.952 5.624z" transform="translate(-13 13.189)"/>`;
    else if(!!block.runs)
    	marks += `${base4}`;
    else if(block.bases?.length==3)
    	marks += `${base3}`;
    else if(block.bases?.length==2)
    	marks += `${base2}`;
    if(block.bases?.length>1&&!!block.bases[0])
    	marks += `<text xml:space="preserve" x="67" y="84" transform="translate(-13.749 -30.811)"><tspan style="font-weight:700;font-size:8px;font-family:Arial;fill:#000;stroke:none;text-align:center;" x="67" y="84">${block.bases[0]}</tspan></text>`;
 		if(block.bases?.length>2&&!!block.bases[1])
 			marks += `<text xml:space="preserve" x="67" y="60" transform="translate(-13.749 -30.811)"><tspan style="font-weight:700;font-size:8px;font-family:Arial;fill:#000;stroke:none;text-align:center;" x="67" y="60">${block.bases[1]}</tspan></text>`;
 		if(block.bases?.length>3&&!!block.bases[2])
 			marks += `<text xml:space="preserve" x="42" y="60" transform="translate(-13.749 -30.811)"><tspan style="font-weight:700;font-size:8px;font-family:Arial;fill:#000;stroke:none;text-align:center;" x="42" y="60">${block.bases[2]}</tspan></text>`;
 		if(block.bases?.length>=4&&!!block.bases[3])
 			marks += `<text xml:space="preserve" x="42" y="84" transform="translate(-13.749 -30.811)"><tspan style="font-weight:700;font-size:8px;font-family:Arial;fill:#000;stroke:none;text-align:center;" x="42" y="84">${block.bases[3]}</tspan></text>`;
 			
    if(block.location)
    {
      marks += `<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1" d="m60 85`;
      if(block.playType&&block.playType.indexOf("fly")>-1)
        marks += `c6-13 5.744-25.112`;
      marks += " " + (block.location[0]-160)/10;
      marks += " " + (320-block.location[1])/-8;
      marks += `" transform="translate(-13.749 -30.811)"/>
      `;
    }
    if(block.outs)
    {
    	marks += `<text xml:space="preserve" x="88" y="43.8" transform="translate(-13.749 -30.811)"><tspan style="font-weight:700;font-size:8px;font-family:Arial;fill:#f00;stroke:none;text-align:center;" x="88" y="43.8">${block.outs}</tspan></text>`;
    	marks += `<path style="fill:none;stroke:red;stroke-width:1.2;stroke-linecap:round" d="M96 30a6 6 0 0 1-6 6 6 6 0 0 1-6-6 6 6 0 0 1 6-6 6 6 0 0 1 6 6z" transform="translate(-13.749 -19.811)"/>`;
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
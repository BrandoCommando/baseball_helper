const Util = require("./util");

class PlayerStats {
  constructor(o) {
    if (typeof (o) != "object")
      this.name = o;
    else if(o.name)
      this.name = o.name;
    this.battingStats = {
      gp: 0,
      pa: 0,
      ab: 0,
      avg: 0,
      obp: 0,
      ops: 0,
      slg: 0,
      h: 0,
      "1B": 0,
      "2B": 0,
      "3B": 0,
      hr: 0,
      rbi: 0,
      r: 0,
      bb: 0,
      /** Strikeouts (as Batter) */
      so: 0,
      kl: 0,
      hbp: 0,
      sac: 0,
      sf: 0,
      fc: 0,
      /** Reached on Dropped 3rd strike */
      kd3: 0,
      /** Reached on Error */
      roe: 0,
      /** Stolen Bases */
      sb: 0,
      /** Bases Advanced on Passed Balls */
      pb: 0,
      /** Bases Advanced on Wild Pitches */
      wp: 0,
      pik: 0,
      cs: 0,
      /** Hits with 2 strikes */
      h2s: 0,
      /** Extra Base Hits */
      xbh: 0,
      /** Hard Hit Balls */
      hhb: 0,
      /** Total Bases */
      tb: 0,
      /** Pitches Seen */
      ps: 0,
      /** Total Grounders */
      tg: 0,
      /** Total Flies */
      tfl: 0,
      /** Total Line Drives */
      tl: 0,
      /** Total Balls Seen */
      tbs: 0,
      /** Total Strikes swinging */
      tsw: 0,
      /** Total Strikes caught Looking */
      tsl: 0,
      /** Total Foul Balls */
      tf: 0,
      /** Total Fouls with 2 strikes */
      tf2: 0
    };
    this.fieldingStats = {
      /** Total Touches */
      tt: 0,
      /** Total Chances */
      tc: 0,
      /** Assists */
      a: 0,
      /** Errors */
      e: 0,
      /** Put Outs */
      po: 0,
      /** Air Outs (Fly/Line) */
      ao: 0,
      /** Unassisted Put Outs */
      upo: 0,
      /** Runners Caught Stealing */
      cs: 0,
      /** Double Plays */
      dp: 0,
      /** Triple Plays */
      tp: 0
    };
    this.pitchingStats = {
      /** Inning Pitched */
      ip: 0,
      /** Games Pitched */
      gp: 0,
      /** Games Started */
      gs: 0,
      /** Batters Faced */
      bf: 0,
      "#P": 0,
      w: 0,
      l: 0,
      s: 0,
      /** Hits Allowed */
      h: 0,
      /** Runs Allowed */
      r: 0,
      /** Earned Runs */
      er: 0,
      era: 0,
      whip: 0,
      /** Walks */
      bb: 0,
      /** Strike Outs (as Pitcher) */
      so: 0,
      /** Strike Outs Looking */
      kl: 0,
      hbp: 0,
      lob: 0,
      cs: 0,
      sb: 0,
      wp: 0,
      /** Total Balls */
      tb: 0,
      /** Total Strikes */
      ts: 0,
      /** Total Strikes Looking */
      tsl: 0,
      /** Total Fouls */
      tf: 0,
    };
    this.catchingStats = {
      /** Pitches caught */
      '#C': 0,
      /** Total Chances */
      tc: 0,
      /** Assists */
      a: 0,
      /** Put-Outs */
      po: 0,
      /** Errors */
      e: 0,
      /** 3rd strikes dropped */
      kd3: 0,
      /** Passed Balls Allowed */
      pb: 0,
      /** Stolen Bases Allowed */
      sb: 0,
      /** Runners Caught Stealing (Home) */
      cs: 0,
      /** Catcher's Caught Stealing */
      ccs: 0,
      pik: 0
    };
    this.battingEvents = [];
    this.fieldingEvents = [];
    this.pitchingEvents = [];
    this.catchingEvents = [];
    this.batters_faced = [];
    this.sprayChart = [];
    this.pitchStart = {inning:0,outs:0};
    if (typeof (o) == "object")
      this.accumulate(o);
  };
  /**
   *
   * @param {PlayerStats} other
   */
  accumulate(other) {
    let key = '';
    if(typeof(other)!="object") return this;
    if(other.battingStats)
      Object.keys(other.battingStats).forEach((key)=>{
        if(!isNaN(other.battingStats[key]))
          this.battingStats[key] += other.battingStats[key];
      });
    if(other.battingStats.e)
      this.battingStats.roe += other.battingStats.roe;
    if(other.pitchingStats)
      Object.keys(other.pitchingStats).forEach((key)=>{
        if(!isNaN(other.pitchingStats[key]))
        {
          if(key=="ip")
          { 
            this.pitchingStats[key] = Util.addIP(this.pitchingStats.ip, other.pitchingStats.ip);
          } else
            this.pitchingStats[key] += other.pitchingStats[key];
        }
      });
    if(other.catchingStats)
      Object.keys(other.catchingStats).forEach((key)=>{
        if(!isNaN(other.catchingStats[key]))
          this.catchingStats[key] += other.catchingStats[key];
      });
    if(other.fieldingStats)
      Object.keys(other.fieldingStats).forEach((key)=>{
        if(!isNaN(other.fieldingStats[key]))
          this.fieldingStats[key] += other.fieldingStats[key];
      });
    if(other.sprayChart)
    for (var hit of [...other.sprayChart])
      this.sprayChart.push(hit);
    if(other.battingEvents?.length)
      Object.values(other.battingEvents).forEach((be)=>this.battingEvents.push(this.cleanEvent(be)));
    if(other.fieldingEvents?.length)
      Object.values(other.fieldingEvents).forEach((fe)=>this.fieldingEvents.push(fe));
    if(other.pitchingEvents?.length)
      Object.values(other.pitchingEvents).forEach((pe)=>this.pitchingEvents.push(pe));
    if(other.catchingEvents?.length)
      Object.values(other.catchingEvents).forEach((ce)=>this.catchingEvents.push(ce));
    this.calculate();
    return this;
  }
  toJson(){
    const out = {name:this.name};
    ['batting','fielding','catching','pitching'].forEach((cat)=>{
      const type = `${cat}Stats`;
      out[type] = {};
      Object.keys(this[type]).forEach((stat)=>{
        const val = this[type][stat];
        if(val>0)
          out[type][stat] = val;
      });
    });
    ['batting','fielding','catching','pitching'].forEach((cat)=>{
      const etype = `${cat}Events`;
      if(typeof(this[etype])=="object"&&Array.isArray(this[etype])&&this[etype].length)
        out[etype] = [...this[etype]];
    });
    if(this.sprayChart.length)
      out.sprayChart = [...this.sprayChart];
    return out;
  }
  /** Batting Average (Hits divided by At-Bats) */
  average() { return (this.battingStats.ab > 0) ? this.battingStats.h / this.battingStats.ab : 0; }
  /** On Base Percentage */
  onbasepercent() { return (this.battingStats.pa > 0) ? (this.battingStats.h + this.battingStats.bb + this.battingStats.hbp) / this.battingStats.pa : 0; }
  slugging() { return this.battingStats.ab == 0 ? 0 : (this.battingStats["1B"] + (2 * this.battingStats["2B"]) + (3 * this.battingStats["3B"]) + (4 * this.battingStats.hr)) / this.battingStats.ab; }
  /** On-Base Plus Slugging */
  onbaseplusslugging() { return this.onbasepercent() + this.slugging(); }
  /** Stolen Base Percentage */
  sbp() { return this.battingStats.sb == 0 ? 0 : this.battingStats.sb / (this.battingStats.sb + this.battingStats.cs); }
  calculate() {
    this.battingStats.ab = this.battingStats.pa - this.battingStats.bb - this.battingStats.hbp - this.battingStats.sac;
    if(this.pitchingStats.bf>0)
      this.pitchingStats.era = parseFloat((this.pitchingStats.er / this.pitchingStats.bf).toFixed(3));
    if(this.pitchingStats.ip>0)
      this.pitchingStats.whip = parseFloat(((this.pitchingStats.bb + this.pitchingStats.h) / this.pitchingStats.ip).toFixed(3));
    // delete this.batters_faced;
    this.battingStats.avg = parseFloat(this.average().toFixed(3));
    this.battingStats.slg = parseFloat(this.slugging().toFixed(3));
    this.battingStats.obp = parseFloat(this.onbasepercent().toFixed(3));
    this.battingStats.ops = parseFloat(this.onbaseplusslugging().toFixed(3));
    this.fieldingStats.tc = this.total_chances();
    this.catchingStats.tc = this.catchingStats.a + this.catchingStats.e + this.catchingStats.po;
  }
  cleanEvent(event) {
    const r = {};
    ['gameId','sequence_number','teamId','opponentId','offense','defense','createdAt','batterId','player','pitcher','defender','position','inning','out','outs'].forEach((k)=>{if(typeof(event[k])!="undefined")r[k]=event[k];});
    if(event.attributes)
    {
      if(event.attributes.defenders?.length)
      {
        r.location = event.attributes.defenders[0].location;
        r.position = event.attributes.defenders[event.attributes.defenders.length-1].position;
      }
      r.playType = event.attributes.playType;
    }
    return r;
  }
  ball_in_play(event) {
    const bases = ['single', 'double', 'triple', 'home_run'].indexOf(event.attributes.playResult);
    if (bases > -1) {
      this.battingStats.h++;
      if (bases > 0) this.battingStats.xbh++;
      this.battingStats.tb += (bases + 1);
      if(event.counts?.strikes==2)
        this.battingStats.h2s++;
    }
    this.battingEvents.push(this.cleanEvent(event));
    if (event.attributes.playType) {
      if (event.attributes.playType.indexOf("fly") > -1)
        this.battingStats.tfl++;
      else if (event.attributes.playType.indexOf("ground") > -1)
        this.battingStats.tg++;
      if (event.attributes.playType.indexOf("line") > -1) {
        this.battingStats.hhb++;
        this.battingStats.tl++;
      }
      if (event.attributes.playType.indexOf("hard") > -1)
        this.battingStats.hhb++;
    }
    if (event.offense && Object.keys(this.battingStats).indexOf(event.offense) > -1)
      this.battingStats[event.offense]++;
    else if (event.offense && Object.keys(this.battingStats).indexOf(event.offense.toLowerCase()) > -1)
      this.battingStats[event.offense.toLowerCase()]++;
    else if (event.offense == 'E')
      this.battingStats.roe++;
    if (event.attributes?.defenders?.length > 0 && event.attributes.defenders[0].location)
      this.sprayChart.push(this.cleanEvent(event));
  }
  face_batter(batterId, inning) {
    if (!this.batters_faced.length)
      this.batters_faced.push({ batterId, pitches: 0, inning: inning });
    else if (this.batters_faced[this.batters_faced.length - 1].batterId != batterId)
      this.batters_faced.push({ batterId, pitches: 0, inning: inning });
    this.batters_faced[this.batters_faced.length - 1].pitches++;
    return this;
  }
  putOnMound(inning, outs) {
    if(!this.batters_faced.length)
      this.pitchingStats.gp++;
    if(!inning&&!outs)
      this.pitchingStats.gs++;
    this.pitchStart = {inning,outs};
  }
  relieve(inning, outs) {
    if(this.pitchStart.ended) return;
    if(!this.batters_faced.length) return;
    this.pitchingStats.bf += this.batters_faced.length;
    let ip = inning - this.pitchStart.inning;
    if(this.pitchStart.outs>0)
      outs += (3 - this.pitchStart.outs);
    if(!ip&&inning==this.pitchStart.inning&&outs==this.pitchStart.outs) {
      outs += this.batters_faced.length;
    }
    // console.log(`Relieving pitcher (${this.name}) in ${inning} with ${outs} outs: ${ip} IP.`, this.pitchStart);
    while(outs > 2) {
      ip++;
      outs -= 3;
    }
    ip += outs / 10;
    this.pitchingStats.ip += ip;
    this.pitchStart.ended = {inning,outs};
  }
  pitch(event, inning) {
    this.face_batter(event.batterId, inning);
    // if(event?.attributes?.result!="ball_in_play")
    this.pitchingStats["#P"]++;
    if (event?.attributes?.result == "ball")
      this.pitchingStats.tb++;
    else if (event?.attributes?.result?.indexOf("foul") > -1)
      this.pitchingStats.tf++;
    else if (event?.attributes?.result?.indexOf("strike") > -1)
      this.pitchingStats.ts++;
    if (event?.attributes?.result?.indexOf("looking") > -1)
      this.pitchingStats.tsl++;
    if (event.playResult)
    {
      this.pitchingStats.so++;
      if (event.playResult == "ꓘ")
        this.pitchingStats.kl++;
    }
    return this;
  }
  total_chances() { return this.fieldingStats.po + this.fieldingStats.a + this.fieldingStats.e; }
  fielding_play(event, defender)
  {
    // console.log(`Fielding play`, {defender,event});
    const ev = {...this.cleanEvent(event),...defender};
    if(ev.playerId) delete ev.playerId;
    const prev = this.fieldingEvents.findIndex((fe)=>fe.createdAt==event.createdAt);
    if(prev==-1)
      this.fieldingEvents.push(ev);
    else
      return this.fieldingEvents[prev].short;
    const short = {playerId:event.playerId};
    const dlen = event.attributes.defenders.length;
    if(event.attributes.extendedPlayResult=="double_play")
      short.dp = ++this.fieldingStats.dp;
    else if(event.attributes.extendedPlayResult=="triple_play")
      short.tp = ++this.fieldingStats.tp;
    if(defender.position=='C')
    {
      if(defender.error) short.catch_error = ++this.catchingStats.e;
      else if(defender.putout)
        short.catch_putout = ++this.catchingStats.cs;
      else if(defender.assist)
        short.catch_assist = ++this.catchingStats.a;
    } else {
      short.tt = ++this.fieldingStats.tt;
      if(defender.putout)
      {
        short.putout = ++this.fieldingStats.po;
        if(event.attributes.playType&&(event.attributes.playType.indexOf("line")>-1||event.attributes.playType.indexOf("fly")>-1))
          short.airout = ++this.fieldingStats.ao;
        else if(dlen==1)
          short.upo = ++this.fieldingStats.upo;
      } else if(defender.assist)
        short.assist = ++this.fieldingStats.a;
      else if(defender.error)
        short.error = ++this.fieldingStats.e;
    }
    if(defender.player)
      short.player = defender.player;
    else if(defender.playerId)
      short.playerId = defender.playerId;
    ev.short = short;
    return short;
  }
}
exports.PlayerStats = PlayerStats;
exports.PlayerStatTitles = {
  battingStats: {
    gp: "Games Played",
    pa: "Plate Appearances",
    ab: "At Bats",
    avg: "Batting Average",
    obp: "On Base Percentage",
    ops: "On-Base Plus Slugging",
    slg: "Slugging",
    h: "Hits",
    "1B": "Singles",
    "2B": "Doubles",
    "3B": "Triples",
    hr: "Home-Runs",
    rbi: "Runs Batted In",
    r: "Runs scored",
    bb: "Bases on Balls (Walks)",
    so: "Strikeouts",
    kl: "Strikeouts Looking",
    hbp: "Hit By Pitches",
    sac: "Sacrifices",
    sf: "Sacrifice Flies",
    fc: "Fielders Choice",
    roe: "Reached on Error",
    sb: "Stolen Bases",
    pb: "Bases Advanced on Passed Balls",
    wp: "Bases Advanced on Wild Pitches",
    pik: "Pick-Offs",
    cs: "Caught Stealing",
    h2s: "Hits with 2 strikes",
    xbh: "Extra Base Hits",
    hhb: "Hard Hit Balls",
    tb: "Total Bases",
    ps: "Pitches Seen",
    tg: "Total Grounders",
    tfl: "Total Flies",
    tl: "Total Line Drives",
    tbs: "Total Balls Seen",
    tsw: "Total Strikes Swinging",
    tsl: "Total Strikes caught Looking",
    tf: "Total Fouls",
    tf2: "Total Fouls with 2 strikes"
  },
  fieldingStats: {
    tc: "Total Chances",
    a: "Assists",
    po: "Put Outs",
    upo: "Unassisted Put Outs",
    ao: "Air Outs",
    e: "Errors",
    dp: "Double Plays",
    tp: "Triple Plays"
  },
  pitchingStats: {
    ip: "Innings Pitched",
    gp: "Games Pitched",
    gs: "Games Started",
    bf: "Batters Faced",
    "#P": "Total Pitches",
    w: "Wins",
    l: "Losses",
    s: "Saves",
    h: "Hits Allowed",
    r: "Runs Allowed",
    er: "Earned Runs",
    era: "Earned Runs Average",
    whip: "Walks plus Hits per Inning Pitched",
    bb: "Walks",
    so: "Strike Outs",
    kl: "Strike Outs Looking",
    hbp: "Players Hit",
    lob: "Players Left on Base",
    cs: "Runners Caught Stealing",
    sb: "Stolen Bases",
    wp: "Bases Stolen due to Wild Pitch",
    tb: "Total Balls thrown",
    ts: "Total Strikes thrown",
    tsl: "Total Strikes Looking",
    tf: "Total Fouls",
  },
  catchingStats: {
    '#C': 'Total Pitches caught',
    tc: "Total Chances",
    a: "Assists",
    po: "Put Outs",
    e: "Errors",
    kd3: "3rd Strikes Dropped",
    pb: "Bases stolen on Passed Balls",
    sb: "Stolen Bases Allowed",
    cs: "Runners Caught Stealing (Home)",
    ccs: "Catcher's Caught Stealing",
    pik: "Runners Picked off"
  }
};

class scoreblock {
  constructor(playerId,row) {
    this.playerId = playerId;
    this.pitcher = "";
    this.row = row;
    this.strikes = this.balls = 0;
    this.pitches = [];
    this.playType = "";
    this.location = [];
    this.bases = [];
    this.offense = "";
    this.defense = "";
    this.runs = 0;
    this.outs = 0;
    this.rbis = 0;
    this.events = [];
  }
}
class scoreinning {
  constructor(inning)
  {
    this.inning = inning;
    /** @type scoreblock[] */
    this.plays = [];
  }
}
class scorebook {
  constructor(inning)
  {
    this.inning = inning;
    /** @type scoreinning[] */
    this.columns = [];
    this.columns.push(
      new scoreinning(inning)
    );
  }
}
class scorebooks {
  constructor() {
    this.currentColumn = [0,0];
    this.currentInning = 1;
    this.books = {
      away: new scorebook(1),
      home: new scorebook(1)
    };
  }
  /**
   * 
   * @param {*} home 
   * @returns {scorebook}
   */
  getBook(home)
  {
    return home ? this.books.home : this.books.away;
  }
  getCurrentInning(home)
  {
    const book = this.getBook(home);
    if(!book.columns[this.currentColumn[home]])
      book.columns[this.currentColumn[home]] = new scoreinning(this.currentInning);
    return book.columns[this.currentColumn[home]];
  }
  /**
   * 
   * @param {*} home 
   * @param {string} playerId 
   * @param {*} noAdd
   * @returns {scoreblock}
   */
  getCurrentBlock(home, playerId, noAdd)
  {
    const inning = this.currentInning;
    const book = this.getBook(home);
    var c, i;
    for(c = book.columns.length - 1; c >= 0; c--)
    {
      const cols = book.columns[c];
      if(cols.inning != inning) continue;
      for(i=cols.plays.length-1;i>=0;i--)
        if(cols.plays[i].playerId==playerId)
          return cols.plays[i];
    }
    if(!!noAdd) return false;
    const cols = book.columns[this.currentColumn[home]];
    cols.plays.push(new scoreblock(playerId,cols.plays.length));
    return cols.plays[cols.plays.length-1];
  }
  getBlockByRow(home, row, inning)
  {
    const book = this.getBook(home);
    var c, i;
    if(!inning) inning = 1;
    for(c=0;c<book.columns.length;c++)
    {
      const cols = book.columns[c];
      if(cols.inning != inning) continue;
      for(i=0;i<cols.plays.length;i++)
        if(cols.plays[i].row == row)
          return cols.plays[i];
    }
    return false;
  }
  changePlayerByRow(home, row, toPlayerId)
  {
    const block = this.getBlockByRow(home, row);
    if(block?.bases?.length||block?.pitches?.length)
    {
      console.log(`Changing block player to ${toPlayerId}`, block);
      block.playerId = toPlayerId;
    }
  }
  newInning()
  {
    this.currentColumn[0]++;
    this.currentColumn[1]++;
    this.currentInning++;
    this.books.away.columns[this.currentColumn[0]] = new scoreinning(this.currentInning);
    this.books.home.columns[this.currentColumn[1]] = new scoreinning(this.currentInning);
  }
  batterUp(home, playerId, extra, row)
  {
    /** @type scorebook */
    const book = home ? this.books.home : this.books.away;
    // this.lastBatter[home] = playerId;
    if(!book.columns[this.currentColumn[home]])
      book.columns[this.currentColumn[home]] = new scoreinning(this.currentInning);
    const cur = this.getCurrentBlock(home, playerId, true);
    if(!!cur)
    {
      const plays = book.columns[this.currentColumn[home]].plays;
      const myPlay = plays.find((block)=>block.playerId==playerId);
      const batPlays = plays.filter((block)=>!!block.playType||block?.pitches?.length);
      if(!!myPlay&&batPlays.length>1)
      {
        if(!myPlay.bases.length&&!myPlay.outs&&!myPlay.events.length) return myPlay;
        // if(myPlay.pitches.length>0)
        {
          this.currentColumn[home]++;
          console.log(`Extra inning column: ${batPlays.length}`, {cur, col: this.currentColumn[home], inn: this.currentInning});
        }
        return this.batterUp(home, playerId, true, row);
      }
    }
    if(!row) row = book.columns[this.currentColumn[home]].plays.length;
    const newblock = new scoreblock(playerId,row);
    if(!book.columns[this.currentColumn[home]].plays.length&&!extra)
      newblock.top = true;
    book.columns[this.currentColumn[home]].plays.push(newblock);
    return book.columns[this.currentColumn[home]].plays.find((b)=>b.playerId==playerId);
  }
  hasBlock(home, inning, playerId)
  {
    const book = home ? this.books.home : this.books.away;
    if(!book[inning])
      return false;
    if(!book[inning].plays.find((b)=>b.playerId==playerId))
      return false;
    return true;
  }
  static getScoreHTML(block) {
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
      marks += `<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1" d="m60 85 7.5-7.5m-.5 -1.5l1.943 1.943" transform="translate(-13.749 -30.811)"/>`;
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
      if(block.playType=="ground_ball")
        stroke = "1.2,2.4"
      marks += `<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:${stroke};stroke-dashoffset:0;stroke-opacity:1" d="m60 85`;
      let x2 = (block.location[0]-160)/7;
      let y2 = (340-block.location[1])/-7
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
        marks += `<text xml:space="preserve" style="font-weight:700;font-size:19px;font-family:Arial;text-align:center;text-anchor:middle;fill:red;stroke:none;" x="60" y="62" transform="translate(-13.749 -30.811)"><tspan style="font-size:19px;fill:red;text-align:center;stroke:none;" x="60" y="62">${block.defense}</tspan></text>`;
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
}

module.exports = { ScoreBooks: scorebooks, ScoreBook: scorebook, ScoreInning: scoreinning, ScoreBlock: scoreblock };
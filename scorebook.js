class scoreblock {
  constructor() {
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
  }
}
class scorebook {
  constructor() {
    this.currentColumn = [0,0];
    this.currentInning = 1;
    this.books = {
      away: {
        columns: [
          {
            inning: 1,
            plays: {
              // key: playerId
              // value: scoreblock
            }
          }]
        },
      home: {
        columns: [
          {
            inning: 1,
            plays: {}
          }]
      }
    };
  }
  getBook(home)
  {
    return home ? this.books.home : this.books.away;
  }
  getCurrentInning(home)
  {
    const book = this.getBook(home);
    if(!book.columns[this.currentColumn[home]])
      book.columns[this.currentColumn[home]] = { inning: this.currentInning, plays: {} };
    return book.columns[this.currentColumn[home]];
  }
  /**
   * 
   * @param {*} home 
   * @param {*} playerId 
   * @returns {scoreblock}
   */
  getCurrentBlock(home, playerId)
  {
    const cols = this.getCurrentInning(home);
    if(!cols.plays[playerId])
      cols.plays[playerId] = new scoreblock();
    return cols.plays[playerId];
  }
  newInning()
  {
    this.currentColumn[0]++;
    this.currentColumn[1]++;
    this.currentInning++;
    this.books.away.columns[this.currentColumn[0]] = {inning: this.currentInning, plays: {}};
    this.books.home.columns[this.currentColumn[1]] = {inning: this.currentInning, plays: {}};
  }
  batterUp(home, playerId)
  {
    const book = home ? this.books.home : this.books.away;
    // this.lastBatter[home] = playerId;
    if(!book.columns[this.currentColumn[home]])
      book.columns[this.currentColumn[home]] = { inning: this.currentInning, plays: {} };
    if(book.columns[this.currentColumn[home]].plays[playerId])
    {
      if(Object.values(book.columns[this.currentColumn[home]].plays).find((col)=>col.pitches?.length>0))
      {
        this.currentColumn[home]++;
        console.log("Extra inning column", {col: this.currentColumn[home], inn: this.currentInning});
        return this.batterUp(home, playerId);
      }
    }
    book.columns[this.currentColumn[home]].plays[playerId] = new scoreblock();
    return book.columns[this.currentColumn[home]].plays[playerId];
  }
  getBlock(home, inning, playerId)
  {
    const book = home ? this.books.home : this.books.away;
    
    if(!book.columns[inning])
      book.innings[inning] = { inning: inning, plays: {} };
    if(!book[inning].plays[playerId])
      book.innings[inning].plays[playerId] = new scoreblock();
    return book.innings[inning].plays[playerId];
  }
  hasBlock(home, inning, playerId)
  {
    const book = home ? this.books.home : this.books.away;
    if(!book[inning])
      return false;
    if(!book[inning].plays[playerId])
      return false;
    return true;
  }
  static getScoreHTML(block) {
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
    else if(block.bases?.length>=3&&block.bases[2]!="CS")
    	marks += `${base3}`;
    else if(block.bases?.length>=2&&block.bases[1]!="CS")
    	marks += `${base2}`;
    if(!!block.bases[0])
    	marks += `<text xml:space="preserve" x="67" y="84" transform="translate(-13.749 -30.811)"><tspan style="font-weight:700;font-size:8px;font-family:Arial;fill:#000;stroke:none;text-align:center;" x="67" y="84">${block.bases[0]}</tspan></text>`;
 		if(!!block.bases[1])
    {
 			marks += `<text xml:space="preserve" x="67" y="60" transform="translate(-13.749 -30.811)"><tspan style="font-weight:700;font-size:8px;font-family:Arial;fill:#000;stroke:none;text-align:center;" x="67" y="60">${block.bases[1]}</tspan></text>`;
      if(block.bases[1]=="CS")
        marks += `<path
            style="fill:none;stroke:#000000;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1"
            d="m 74.654133,69.981963 -7.7706,-7.770601"
            transform="translate(-13.749 -30.811)"
            />
          <path
            style="fill:none;stroke:#000000;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1"
            d="m 67.854858,61.240035 -1.94265,1.942654"
            transform="translate(-13.749 -30.811)"
            />`;
    }
 		if(!!block.bases[2])
    {
 			marks += `${base1}<text xml:space="preserve" x="42" y="60" transform="translate(-13.749 -30.811)"><tspan style="font-weight:700;font-size:8px;font-family:Arial;fill:#000;stroke:none;text-align:center;" x="42" y="60">${block.bases[2]}</tspan></text>`;
      if(block.bases[2]=="CS")
        marks += `<path
            style="fill:none;stroke:#000000;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1"
            d="m59.113 54.44-7.77 7.771M50.371 61.24l1.943 1.943"
            transform="translate(-13 -30.811)"
            />`;
    }
 		if(!!block.bases[3])
 			marks += `<text xml:space="preserve" x="42" y="84" transform="translate(-13.749 -30.811)"><tspan style="font-weight:700;font-size:8px;font-family:Arial;fill:#000;stroke:none;text-align:center;" x="42" y="84">${block.bases[3]}</tspan></text>`;
 			
    if(block.location)
    {
      marks += `<path style="fill:none;stroke:#000;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1" d="m60 85`;
      if(block.playType&&block.playType.indexOf("fly")>-1)
        marks += `c6-13 5.744-25.112`;
      marks += " " + (block.location[0]-160)/7;
      marks += " " + (340-block.location[1])/-7;
      marks += `" transform="translate(-13.749 -30.811)"/>
      `;
    }
    if(block.outs)
    {
    	marks += `<text xml:space="preserve" x="88" y="43.8" transform="translate(-13.749 -30.811)"><tspan style="font-weight:700;font-size:8px;font-family:Arial;fill:#f00;stroke:none;text-align:center;" x="88" y="43.8">${block.outs}</tspan></text>`;
    	marks += `<path style="fill:none;stroke:red;stroke-width:1.2;stroke-linecap:round" d="M96 30a6 6 0 0 1-6 6 6 6 0 0 1-6-6 6 6 0 0 1 6-6 6 6 0 0 1 6 6z" transform="translate(-13.749 -19.811)"/>`;
      if(block.defense)
        marks += `<text xml:space="preserve" style="font-weight:700;font-size:19px;font-family:Arial;text-align:center;text-anchor:middle;fill:red;stroke:none;" x="58.401" y="77.045" transform="translate(-13 -30.811)"><tspan style="font-size:19px;fill:red;text-align:center;stroke:none;" x="58.401" y="77.045">${block.defense}</tspan></text>`;
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

module.exports = { ScoreBook: scorebook, ScoreBlock: scoreblock };
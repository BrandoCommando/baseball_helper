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
}

module.exports = { ScoreBooks: scorebooks, ScoreBook: scorebook, ScoreInning: scoreinning, ScoreBlock: scoreblock };
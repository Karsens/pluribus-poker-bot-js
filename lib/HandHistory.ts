export type HandHistoryType = {
  preflop: string;
  flop: string;
  turn: string;
  river: string;
  over: string;
  log: string[];
  bettingRound: number;
  board: string[];
  chips: number;
  pLastAction: (string | null)[];
  pFolded: boolean[];
  pChips: number[];
  pCards: [string, string][];
  pMPIP: number[];
  pBet: number[];
  deck: string[];
  depth: number;
  currentPlayer: number;
  showdown: string[];
  winner?: number;
};

export class HandHistory {
  preflop: string;
  flop: string;
  turn: string;
  river: string;
  over: string;
  log: string[];
  bettingRound: number;
  board: string[];
  chips: number;
  pLastAction: (string | null)[];
  pFolded: boolean[];
  pChips: number[];
  pCards: [string, string][];
  pMPIP: number[];
  pBet: number[];
  deck: string[];
  depth: number;
  currentPlayer: number;
  showdown: string[];
  winner?: number;

  constructor(h: HandHistoryType) {
    this.preflop = h.preflop;
    this.flop = h.flop;
    this.turn = h.turn;
    this.river = h.river;
    this.over = h.over;
    this.bettingRound = h.bettingRound;
    this.board = [...h.board];
    this.chips = h.chips;
    this.pLastAction = [...h.pLastAction];
    this.pFolded = [...h.pFolded];
    this.pCards = [...h.pCards];
    this.pMPIP = [...h.pMPIP];
    this.pBet = [...h.pBet];
    this.pChips = [...h.pChips];
    this.deck = [...h.deck];
    this.depth = h.depth;
    this.log = h.log;
    this.currentPlayer = h.currentPlayer;
    this.showdown = h.showdown;
    this.winner = h.winner;
  }
}

var Hand = require("pokersolver").Hand; //https://github.com/goldfire/pokersolver
const fs = require("fs");

const STARTING_STACK = 10000;

const STRATEGY_INTERVAL = 1000; //10000 for pluribus
const PRUNE_THRESHOLD = 200;
const LCFR_THRESHOLD = 400;
const DISCOUNT_INTERVAL = 2; //10 in pluribus
const PLAYERS = [0, 1, 2];
const C = -300000000;

const BETTING_ROUND_PREFLOP = 0;
const BETTING_ROUND_FLOP = 1;
const BETTING_ROUND_TURN = 2;
const BETTING_ROUND_RIVER = 3;
const BETTING_OVER = 4;
//for starters, play with 20 cards.
const ranks = [6, 7, 8, 9, "T", "J", "Q", "K", "A"];

const ALL_ACTIONS = ["fold", "call", "check", "none", "bet"]; //bet2
/*

type Node = {
  infoSet: string,
  regretSum: number[],
  strategy: number[],
  strategySum: number[],//not used i guess,
  actionCounter: number[]
}


type PlayerAction = "none" | "fold" | "check" | "call" | "bet1" | "bet2";
type Cards = string[];//two strings

*/

class History {
  constructor(h) {
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

function nextRound(h) {
  h.bettingRound++;
  h.currentPlayer = 0;
  let cards = [];

  const rounds = ["Preflop", "Flop", "Turn", "River"];

  if (h.bettingRound === BETTING_ROUND_FLOP) {
    //draw flop
    cards = [h.deck.pop(), h.deck.pop(), h.deck.pop()];
  } else if (h.bettingRound === BETTING_ROUND_TURN) {
    //draw turn or river
    cards = [h.deck.pop()];
  } else if (h.bettingRound === BETTING_ROUND_RIVER) {
    cards = [h.deck.pop()];
  }

  h.board = h.board.concat(cards);

  h.chips = h.chips + h.pBet.reduce((a, b) => a + b, 0);
  h.pBet = PLAYERS.map(p => 0);
  if (h.bettingRound < BETTING_OVER) {
    h.log = h.log.concat([rounds[h.bettingRound] + " comes " + cards.join(",")]);
  }
  return h;
}

function allOthersFolded(h) {
  return h.pFolded.filter(p => !p).length === 1;
}

function isTerminal(h) {
  const isTerminal = allOthersFolded(h) || h.bettingRound === BETTING_OVER;
  return isTerminal;
}

function haveShowdown(h) {
  const unfoldedMPIP = h.pMPIP.filter((p, i) => !h.pFolded[i]);
  return h.board.length === 5 && h.pFolded.filter(p => !p).length >= 2 && h.river.split(",").length >= PLAYERS.length;
}

function getUtility(h, p) {
  const youWon = h.winner === p;
  if (youWon) {
    return h.chips;
  } else {
    const mpip = h.pMPIP[p];
    return -1 * mpip;
  }
}

function calculateWinner(h) {
  const board = h.board;

  let showdownWinner;
  const gotToShowdown = haveShowdown(h);
  let showdown;
  let whoDidnt;
  if (gotToShowdown) {
    const playersInHand = h.pFolded.map(p => !p);

    const scores = h.pCards.filter((cards, i) => playersInHand[i]).map(cards => Hand.solve(cards.concat(board)));
    showdown = scores.map(s => s.descr);

    const showdownWinnerCards = Hand.winners(scores);
    showdownWinner = scores.findIndex(score => score.descr === showdownWinnerCards[0].descr); //for now, ties are not explored

    h.log = h.log.concat(["Player " + showdownWinner + " wins with " + showdownWinnerCards[0].descr]);
  } else {
    whoDidnt = h.pFolded.findIndex(a => !a);
    h.log = h.log.concat(["Player " + whoDidnt + " wins because everyone else folded"]);
  }

  h.winner = showdownWinner ? showdownWinner : whoDidnt;
  h.showdown = showdown;
  return h;
}

function inHand(h, p) {
  const playerFolded = h.pFolded;
  return !playerFolded[h.currentPlayer];
}

function needsChanceNode(h) {
  // since last chancenode , more than or equal to {PLAYERS.length} actions were taken
  // and all players left ( not action none, not action fold) have equal betsizes
  const lastBettingRoundActions = h.bettingRound === BETTING_ROUND_RIVER ? h.river : h.bettingRound === BETTING_ROUND_TURN ? h.turn : h.bettingRound === BETTING_ROUND_FLOP ? h.flop : h.bettingRound === BETTING_ROUND_PREFLOP ? h.preflop : "";

  const everyoneDidAction = lastBettingRoundActions.split(",").length > PLAYERS.length;

  const playersLeft = h.pFolded.map(a => !a);

  const playerBets = h.pBet.filter((betSize, i) => playersLeft[i]);
  const playerChips = h.pChips.filter((betSize, i) => playersLeft[i]);

  const everyoneAllIn = playerChips.every(chips => chips <= 0);

  const equalBets = allEqual(playerBets);

  const needsChanceCard = (everyoneDidAction || everyoneAllIn) && equalBets;

  // console.log(
  //   "needschancenoce",
  //   needsChanceCard,
  //   "lastBettingRoundActions",
  //   lastBettingRoundActions,
  //   "everyoneDidAction",
  //   everyoneDidAction,
  //   "playersLeft",
  //   playersLeft,
  //   "playerBets",
  //   playerBets,
  //   "equalBets",
  //   equalBets
  // );
  return needsChanceCard;
}

function getCurrentPlayerFromInfoSet(infoSet) {
  const currentPlayer = infoSet.split(",").filter(a => ALL_ACTIONS.includes(a)).length % PLAYERS.length;
  return currentPlayer;
}

function getActionsInfoSet(h, p) {
  const potSize = h.pMPIP.reduce((a, b) => a + b, 0);
  const totalChips = PLAYERS.length * STARTING_STACK;
  const potSizeBuckets = Math.floor(potSize / totalChips * 10); //expect to be 0-9, linear to potSize/totalChips ratio

  const playersRemain = h.pFolded.map(folded => folded ? "0" : "1").reduce((a, b) => a + b, ""); // expect to be 010101 in order of position so 2^players combinations

  const allBetsSize = h.pBet.reduce((a, b) => a + b, 0);
  const potSizeWithBets = potSize + allBetsSize;
  const myBet = h.pBet[p];
  const biggestBet = Math.max(...h.pBet);
  const toCall = biggestBet - myBet;
  const potOdds = toCall / potSizeWithBets;
  const potOddsBuckets = Math.floor(potOdds * 10); //expect it to be 0-9

  const positions = PLAYERS.map((p, i) => PLAYERS.length - i); //for six players, expect to be [5,4,3,2,1,0]
  let myPosition = positions[p]; //0 is sb, players.length is dealer. so the higher the better. however, sometimes, you're in position depending on other players folded. this has to be taken into account. Therefore, 0 should be in position. then substract players that have folded
  for (let pl = p + 1; pl < PLAYERS.length; pl++) {
    if (h.pFolded[pl]) {
      myPosition--;
    }
  }
  //expect myposition to be 0 if in position, 1 if almost in position, etc. so 0-8 for 9 players

  const bettingRound = h.bettingRound;

  const actionsString = bettingRound + "," + myPosition + "," + potOddsBuckets + "," + potSizeBuckets + "," + playersRemain; //expect it to be something like 1023,000111

  return actionsString;
}

function getHandStrength(ourCards, board) {
  //should return number indicating how strong your hand is. should return about 30 combinations
  const STRAIGHT_OR_ROYAL_FLUSH = 1;
  const FOUR_OF_A_KIND = 2;
  const FULL_HOUSE_HIGH = 3;
  const FULL_HOUSE_MID = 4;
  const FULL_HOUSE_LOW = 5;
  const FLUSH_HIGH = 6;
  const FLUSH_MID = 7;
  const FLUSH_LOW = 8;
  const STRAIGHT_HIGH = 9; //678[9T]
  const STRAIGHT_MID = 10; //[5]678[9]
  const STRAIGHT_LOW = 11; //[56]789
  const THREE_OF_A_KIND_HIGH = 12;
  const THREE_OF_A_KIND_MID = 13;
  const THREE_OF_A_KIND_LOW = 14;
  const TWO_PAIR_HIGH_TOP_KICKER = 15;
  const TWO_PAIR_HIGH_MID_KICKER = 16;
  const TWO_PAIR_HIGH_LOW_KICKER = 17;
  const TWO_PAIR_MID = 18;
  const TWO_PAIR_LOW = 19;
  const FLUSH_DRAW = 20;
  const STRAIGHT_DRAW = 21;
  const TOP_PAIR_TOP_KICKER = 22;
  const TOP_PAIR_MID_KICKER = 23;
  const TOP_PAIR_LOW_KICKER = 24;
  const MID_PAIR = 25;
  const LOW_PAIR = 26;
  const HIGH_CARD_TOP = 27;
  const HIGH_CARD_MID = 28;
  const HIGH_CARD_LOW = 29;

  const cards = ourCards.concat(board);

  // console.log("solve for ", cards);
  const rank = Hand.solve(cards).rank; //for now, 0-9

  return rank; //1-29
}

function getBoardStrength(cards) {
  const cardsWithoutSuit = cards.map(card => card.charAt(0));
  const cardCount = cardsWithoutSuit.map(rank => cardsWithoutSuit.filter(rank2 => rank2 === rank).length);
  let pairs = "X";
  const hasPair = cardCount.filter(c => c === 2).length;
  const hasTrips = cardCount.filter(c => c === 3).length;
  const hasQuads = cardCount.filter(c => c === 4).length;
  if (cardCount.every(x => x === 1)) {
    pairs = "0";
  } else if (hasPair === 2 && hasTrips === 3) {
    pairs = "4";
  } else if (hasPair === 2) {
    pairs = "1";
  } else if (hasPair === 4) {
    pairs = "2";
  } else if (hasTrips === 3) {
    pairs = "3";
  } else if (hasQuads === 4) {
    pairs = "5";
  }
  //pairs 0,1,2,3,4,5 for no pair, one pair, two pair, trips, fullhouse, quads respectively.

  const cardSuits = cards.map(card => card.charAt(1));
  const suitCount = cardSuits.map(suit1 => cardSuits.filter(suit2 => suit2 === suit1).length);
  let flushiness = "Y";
  const hasTwoSuits = suitCount.filter(s => s === 2).length;
  const hasThreeSuits = suitCount.filter(s => s === 3).length;
  const hasFourSuits = suitCount.filter(s => s === 4).length;
  const hasFlush = suitCount.filter(s => s === 5).length;

  if (suitCount.every(amount => amount === 1)) {
    flushiness = "0";
  } else if (hasTwoSuits === 2) {
    flushiness = "1";
  } else if (hasTwoSuits === 4) {
    flushiness = "2";
  } else if (hasThreeSuits === 3) {
    flushiness = "3";
  } else if (hasFourSuits === 4) {
    flushiness = "4";
  } else if (hasFlush === 5) {
    flushiness = "5";
  }
  //flushiness 0,1,2,3,4,5

  const cardsWithoutSuitWithoutPairs = cardsWithoutSuit.filter((c, i) => cardsWithoutSuit.findIndex(c2 => c2 === c) === i);

  const ranksWithoutSuitWithoutPairs = cardsWithoutSuitWithoutPairs.map(card => {
    if (card === "A") return 14;
    if (card === "K") return 13;
    if (card === "Q") return 12;
    if (card === "J") return 11;
    return Number(card);
  });

  const sorted = ranksWithoutSuitWithoutPairs.sort(); //something like 8 10 12 or 8 10

  const diff = sorted.map((rank, i) => sorted[i + 1] ? sorted[i + 1] - rank : undefined).filter(diff => !!diff); //something like 1,1,1,1 for a straight
  const diffString = diff.join("");
  let straightiness = "Z";

  if (diff.every(d => d === 1) && sorted.length === 5) {
    //straight on board
    straightiness = "5";
  } else if (diffString.includes("111")) {
    //open ended on board
    straightiness = "4";
  } else if (diffString.includes("112") || diffString.includes("121") || diffString.includes("211")) {
    //gutter on board
    straightiness = "3";
  } else if (diffString.includes("1") || diffString.includes("2")) {
    // open ended or double gutter possible
    straightiness = "2";
  } else if (diffString.includes("3")) {
    straightiness = "1";
  } else {
    straightiness = "0";
  }
  //straightiness 0,1,2,3,4 for nothing possible, openended or gutter unlikely, open ended or (double)gutter possible, gutter on board, open ended on board, straight on board.

  const boardStrength = pairs + flushiness + straightiness;
  // console.log("cards", cards, "becomes ", boardStrength);
  return boardStrength;
  //should return string indicating [pairs][flushyness][straightyness] like 000 for A5To for a total of 216 combinations
}

function writeInformationSet(infoSet, data) {
  fs.writeFileSync("./data/" + infoSet + ".json", JSON.stringify(data));
}

function getInformationSet(h, p) {
  const actions = getActions(h);

  let infoSet;

  const actionsInfoSet = getActionsInfoSet(h, p);

  if (h.bettingRound === BETTING_ROUND_PREFLOP) {
    const card1 = h.pCards[p][0].charAt(0);
    const card2 = h.pCards[p][1].charAt(0);
    const first = card1 < card2 ? card1 : card2;
    const second = card1 < card2 ? card2 : card1;

    const cards = first + second + (h.pCards[p][0].charAt(1) === h.pCards[p][1].charAt(1) ? "s" : "o");

    infoSet = cards + actionsInfoSet;
  } else {
    const handStrength = getHandStrength(h.pCards[p], h.board);
    const boardStrength = getBoardStrength(h.board, h.bettingRound);

    infoSet = handStrength + "," + boardStrength + "," + actionsInfoSet;
  }

  // console.log("infoset", infoSet);
  // let I = treeMap[infoSet];
  let I = undefined;
  try {
    I = JSON.parse(fs.readFileSync("./data/" + infoSet + ".json"));
    // if (I) {
    //   console.log("I!!!", I);
    // }
  } catch (e) {
    //if undefined, create new and return that one

    const data = {
      infoSet,
      regretSum: actions.map(a => 0),
      strategy: actions.map(a => 1 / actions.length),
      actionCounter: actions.map(a => 0)
    };

    fs.writeFileSync("./data/" + infoSet + ".json", JSON.stringify(data));

    I = data;
  }

  return I;
}

/**
 * returns true if all values in the array are the same
 * @param {*} arr array
 */
const allEqual = arr => arr.every(v => v === arr[0]);

/**
 * get all actions that are currently possible
 * @param {*} h history
 */
function getActions(h) {
  const betsAreEqual = allEqual(h.pBet.filter((p, i) => !h.pFolded[i]));

  const highestBet = Math.max(...h.pBet);
  const currentBet = h.pBet[h.currentPlayer];
  const diff = highestBet - currentBet;

  const hasChips = h.pChips[h.currentPlayer] > diff;

  const hasFolded = h.pFolded[h.currentPlayer];

  let actions = [];

  if (hasFolded) {
    actions = ["none"];
  } else {
    if (betsAreEqual) {
      actions = ["check"];
      if (hasChips) {
        actions = actions.concat(["bet"]); //bet2
      }
    } else {
      actions = ["fold", "call"];

      if (hasChips) {
        actions = actions.concat(["bet"]); //bet2
      }
    }
  }

  return actions;
}

function doAction(h, action, p) {
  if (!action) {
    console.log("Action is ", action);
  }

  const ha = new History(h);

  ha.depth++;

  switch (ha.bettingRound) {
    case BETTING_ROUND_PREFLOP:
      ha.preflop = ha.preflop + ha.currentPlayer + action + ",";
      break;
    case BETTING_ROUND_FLOP:
      ha.flop = ha.flop + ha.currentPlayer + action + ",";
      break;
    case BETTING_ROUND_TURN:
      ha.turn = ha.turn + ha.currentPlayer + action + ",";
      break;
    case BETTING_ROUND_RIVER:
      ha.river = ha.river + ha.currentPlayer + action + ",";
      break;
    case BETTING_OVER:
      ha.over = ha.over + ha.currentPlayer + action + ",";
      break;
  }

  ha.pLastAction[p] = action;

  //do stuff here

  switch (action) {
    case "fold":
      ha.pFolded[ha.currentPlayer] = true;
      ha.log = ha.log.concat(["Player " + ha.currentPlayer + " folds"]);
      break;
    case "call":
      //calls the highest bet

      highestBet = Math.max(...ha.pBet);
      myBet = ha.pBet[ha.currentPlayer];
      diff = highestBet - myBet;

      ha.pChips[ha.currentPlayer] = ha.pChips[ha.currentPlayer] - diff;
      ha.pBet[ha.currentPlayer] = highestBet;
      ha.pMPIP[ha.currentPlayer] = ha.pMPIP[ha.currentPlayer] + diff;
      ha.log = ha.log.concat(["Player " + ha.currentPlayer + " calls " + diff]);

      break;
    case "check":
      ha.log = ha.log.concat(["Player " + ha.currentPlayer + " checks"]);

      break;
    case "bet":
      const potSize = ha.chips + ha.pBet.reduce((a, b) => a + b, 0);

      let betSize = potSize;
      if (ha.pChips[ha.currentPlayer] < betSize) {
        betSize = ha.pChips[ha.currentPlayer];
      }

      ha.pChips[ha.currentPlayer] = ha.pChips[ha.currentPlayer] - betSize;
      ha.pMPIP[ha.currentPlayer] = ha.pMPIP[ha.currentPlayer] + betSize;
      ha.pBet[ha.currentPlayer] = betSize;

      ha.log = ha.log.concat(["Player " + ha.currentPlayer + " bets " + betSize]);

      break;
  }

  ha.currentPlayer = (ha.currentPlayer + 1) % PLAYERS.length;

  return ha;
}

/**
 * returns number of action based on strategy distribution
 */
function randomActionFromStrategy(strategy) {
  const c = Math.random();
  let strategySum = 0;

  for (let i = 0; i < strategy.length; i++) {
    if (strategy[i] < 0 || strategy[i] > 1) {
      console.log("illegal strategy value!", strategy[i]);
    }

    strategySum += strategy[i];

    if (c < strategySum) {
      return i;
    }
  }
}

function isPreflop(I) {
  I.infoSet.length < 10; //to be determined. preflop infoset keys are shorter, but the bettinground is also included in the infoset.
}

function getActionsFromInfoSet(I) {
  //1 get current round actions
  //2 see if they're equal
  return [];
}

function shuffle(a) {
  var j, x, i;
  for (i = a.length - 1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1));
    x = a[i];
    a[i] = a[j];
    a[j] = x;
  }
  return a;
}

function initiateHistory(ms) {
  const unshuffledDeck = ranks.map(rank => rank + "h").concat(ranks.map(rank => rank + "d")).concat(ranks.map(rank => rank + "c")).concat(ranks.map(rank => rank + "s"));

  const deck = shuffle(unshuffledDeck);

  const emptyHistory = new History({
    preflop: "",
    flop: "",
    turn: "",
    river: "",
    over: "",
    log: [],
    bettingRound: 0,
    board: [],
    chips: 150,
    pLastAction: PLAYERS.map(p => null),
    pFolded: PLAYERS.map(p => false),
    pChips: PLAYERS.map(p => p === 0 ? STARTING_STACK - 50 : p === 1 ? STARTING_STACK - 100 : STARTING_STACK),
    pCards: PLAYERS.map(p => [deck.pop(), deck.pop()]),
    pMPIP: PLAYERS.map(p => p === 0 ? 50 : p === 1 ? 100 : 0),
    pBet: PLAYERS.map(p => p === 0 ? 50 : p === 1 ? 100 : 0),
    deck: deck.slice(),
    depth: 0,
    currentPlayer: PLAYERS.length > 2 ? 2 : 1,
    showdown: [],
    winner: undefined
  });

  return emptyHistory;
}

//MCCFR with pruning for very negative regrets
function traverseMCCFR_P(h, p) {
  // console.log("traversemccfr-p", p);
  if (isTerminal(h)) {
    const h2 = calculateWinner(h);
    const utility = getUtility(h2, p);
    return utility;
  } else if (!inHand(h, p)) {
    const h0 = doAction(h, "none", p);
    return traverseMCCFR_P(h0, p); //the remaining actions are irrelevant to Player i
  } else if (needsChanceNode(h)) {
    const ha = nextRound(h);
    return traverseMCCFR_P(ha, p);
  } else if (h.currentPlayer === p) {
    //if history ends with current player to act
    const I = getInformationSet(h, p); // the Player i infoset of this node . GET node?
    const strategyI = calculateStrategy(I.regretSum, h); //determine the strategy at this infoset

    let v = 0;
    let va = [];
    const actions = getActions(h);
    let explored = [];
    for (let a = 0; a < actions.length; a++) {
      if (I.regretSum[a] > C) {
        const ha = doAction(h, actions[a], p);
        va[a] = traverseMCCFR_P(ha, p);
        explored[a] = true;
        v = v + strategyI[a] * va[a];
      } else {
        explored[a] = false;
      }
    }
    let newRegret;
    for (let a = 0; a < actions.length; a++) {
      if (explored[a] === true) {
        newRegret[a] = I.regretSum[a] + va[a] - v;
      }
    }

    const node = I;
    node.regretSum = newRegret;
    node.strategy = strategyI;

    writeInformationSet(I.infoSet, node);

    return v;
  } else {
    const Ph = h.currentPlayer;
    const I = getInformationSet(h, Ph);
    const strategy = calculateStrategy(I.regretSum, h);
    const actions = getActions(h);
    const chosenAction = randomActionFromStrategy(strategy); //sample an action from the probability distribution
    const ha = doAction(h, actions[chosenAction], Ph);

    return traverseMCCFR_P(ha, p);
  }
}

/**
 * update the reegrets for Player i
 */
function traverseMCCFR(h, p) {
  // console.log("traverse it ", h, p);
  if (isTerminal(h)) {
    const h2 = calculateWinner(h);
    const utility = getUtility(h2, p);
    if (utility > 0) {
      // console.log("Terminal with utility", utility, "H", h);
    }
    return utility;
  } else if (!inHand(h, p)) {
    // console.log("!inHand");
    const h0 = doAction(h, "none", p);
    return traverseMCCFR(h0, p); //the remaining actions are irrelevant to Player i
  } else if (needsChanceNode(h)) {
    // console.log("Needs chance node");
    const ha = nextRound(h);
    return traverseMCCFR(ha, p);
  } else if (h.currentPlayer === p) {
    // console.log("You", p);
    //if history ends with current player to act
    const I = getInformationSet(h, p); // the Player i infoset of this node . GET node?
    const strategyI = calculateStrategy(I.regretSum, h); //determine the strategy at this infoset

    let v = 0;
    let va = [];
    const actions = getActions(h);
    let ha;
    for (let a = 0; a < actions.length; a++) {
      ha = doAction(h, actions[a], p);
      va[a] = traverseMCCFR(ha, p);
      v = v + strategyI[a] * va[a];
    }

    let newRegret = [];
    for (let a = 0; a < actions.length; a++) {
      newRegret[a] = I.regretSum[a] + va[a] - v;
    }

    const node = I; //can I upgrade strategy here too?

    node.regretSum = newRegret;
    node.strategy = strategyI;

    writeInformationSet(I.infoSet, node);

    // console.log("we get here", v);

    return v;
  } else {
    const Ph = h.currentPlayer;
    // console.log("Player", Ph, "'s turn");
    const I = getInformationSet(h, Ph);
    const strategy = calculateStrategy(I.regretSum, h);
    const actions = getActions(h);
    const chosenAction = randomActionFromStrategy(strategy); //sample an action from the probability distribution

    let ha;

    if (actions[chosenAction] === undefined) {
      ha = h;
      console.log("shouldnt happen", strategy, actions, chosenAction, h);
    } else {
      ha = doAction(h, actions[chosenAction], Ph);
    }

    return traverseMCCFR(ha, p);
  }
}

/**
 * update the average strategy for Player i
 * @param {*} h history
 * @param {*} p Player i
 */
function updateStrategy(h, p, depth) {
  // console.log("updatestrategy", p);
  if (isTerminal(h) || !inHand(h, p) || h.bettingRound > 0) {
    // console.log("isTerminal(h) || !inHand(h, p) || h.bettingRound > 0");
    //average strategy only tracked on the first betting round
    return;
  } else if (needsChanceNode(h)) {
    // console.log("Needs chance node");
    //sample an action from the chance probabilities
    const ha = nextRound(h);
    updateStrategy(ha, p, depth++);
  } else if (h.currentPlayer === p) {
    // console.log("getCurrentPlayer(h)====p");
    //if history ends with current player to act
    const I = getInformationSet(h, p); // the Player i infoset of this node . GET node?
    const strategyI = calculateStrategy(I.regretSum, h); //determine the strategy at this infoset
    const actions = getActions(h);
    const a = randomActionFromStrategy(strategyI); //sample an action from the probability distribution

    const actionCounter = I.actionCounter;

    actionCounter[a] = actionCounter[a] + 1;

    // if (actionCounter[a] > 1) {
    // console.log(
    //   "Incrementing actioncounter and chancing strategy of ",
    //   I.infoSet,
    //   actionCounter,
    //   actions,
    //   strategyI,
    //   I.regretSum
    // );
    // }

    // console.log("writing ", I.infoSet, actionCounter);
    const data = I;
    data.actionCounter = actionCounter;
    data.strategy = strategyI;

    writeInformationSet(I.infoSet, data); //increment action and add strategy

    const ha = doAction(h, actions[a], p);
    updateStrategy(ha, p, depth++);
  } else {
    const actions = getActions(h);
    // console.log("ELSE");
    let ha;

    for (let a = 0; a < actions.length; a++) {
      ha = doAction(h, actions[a], p);
      updateStrategy(ha, p, depth++); //traverse each action
    }
  }
}

/**
 *
 * @param {*} R(Ii)
 * @param {*} Ii
 */
function calculateStrategy(R, h) {
  let sum = 0;
  let strategyI = [];

  const actions = getActions(h);

  for (let a = 0; a < actions.length; a++) {
    sum = sum + Math.max(R[a], 0);
  }

  for (let a = 0; a < actions.length; a++) {
    if (sum > 0) {
      strategyI[a] = Math.max(R[a], 0) / sum;
    } else {
      strategyI[a] = 1 / actions.length;
    }
  }

  return strategyI;
}

function MCCFR_P(minutes = 1) {
  // do this but then go over all files in /data....

  // for (let p = 0; p < PLAYERS.length; p++) {
  //   Object.keys(treeMap).map((key) => {
  //     const I = treeMap[key];
  //     if (getCurrentPlayerFromInfoSet(I.infoSet) === p) {
  //       const actions = getActionsFromInfoSet(I);
  //       let regretSum = [];
  //       let strategy = [];

  //       for (let a = 0; a < actions.length; a++) {
  //         regretSum[a] = 0;
  //         if (isPreflop(I)) {
  //           strategy[a] = 0; // 𝜙(Ii,a) = 0; not sure if this is correct
  //         }
  //       }
  //       treeMap[I.infoSet] = { ...I, regretSum, strategy };
  //     }
  //   });
  // }

  var start = new Date();
  let iterations = 0;
  for (let t = 0; t / 60000 < minutes; t = new Date() - start) {
    iterations++;
    if (iterations % 1000 === 0) {
      console.log("iterations", iterations, "time", Math.round(t / 1000));
    }

    const emptyHistory = initiateHistory(t);

    for (let p = 0; p < PLAYERS.length; p++) {
      // console.log("Player", p);
      if (t % STRATEGY_INTERVAL === 1) {
        updateStrategy(emptyHistory, p, 0);
      }

      if (t / 60000 > PRUNE_THRESHOLD) {
        const q = Math.random();
        if (q < 0.05) {
          traverseMCCFR(emptyHistory, p);
        } else {
          traverseMCCFR_P(emptyHistory, p);
        }
      } else {
        traverseMCCFR(emptyHistory, p);
      }
    }

    // every 10 minutes, discount regrets and [strategies?] with factor d
    if (t < LCFR_THRESHOLD && t / 60000 % DISCOUNT_INTERVAL === 0) {
      const m = t / 60000;
      const d = m / DISCOUNT_INTERVAL / (m / DISCOUNT_INTERVAL + 1);

      for (let p = 0; p < PLAYERS.length; p++) {
        // do this by going over all files in /data
        // Object.keys(treeMap).map((key) => {
        //   const I = treeMap[key];
        //   if (getCurrentPlayerFromInfoSet(I.infoSet) === p) {
        //     let regretSum = I.regretSum.map((Ra) => Ra * d);
        //     let strategy = I.strategy.map((Sa) => Sa * d);
        //     treeMap[I.infoSet] = { ...I, regretSum, strategy };
        //   }
        // });
      }
    }
  }
  console.log("end");
  return 0; // return 𝜙. must be strategy
}

MCCFR_P(30);

// Object.keys(treeMap).map((I) => {
//   console.log(treeMap[I]);
// });

// console.log("we have ", Object.keys(treeMap).length, "entries in the Object");
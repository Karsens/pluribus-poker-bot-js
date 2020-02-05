var Hand = require("pokersolver").Hand; //https://github.com/goldfire/pokersolver
const TreeMap = require("treemap-js");

const STRATEGY_INTERVAL = 1000; //10000 for pluribus
const PRUNE_THRESHOLD = 200; //should be minutes, not iterations
const LCFR_THRESHOLD = 400;
const DISCOUNT_INTERVAL = 10; //should be minutes, not iterations
const PLAYERS = [0, 1, 2];
const C = -300000000;

const BETTING_ROUND_PREFLOP = 0;
const BETTING_ROUND_FLOP = 1;
const BETTING_ROUND_TURN = 2;
const BETTING_ROUND_RIVER = 3;
const BETTING_OVER = 4;
//for starters, play with 20 cards.
const ranks = ["T", "J", "Q", "K", "A"]; //2, 3, 4, 5, 6, 7, 8, 9,

const ALL_ACTIONS = ["fold", "call", "check", "none", "bet1", "bet2"];
const treeMap = {};
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
  h.log = h.log.concat([rounds[h.bettingRound] + " comes " + cards.join(",")]);
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
  return (
    h.board.length === 5 &&
    h.pFolded.filter(p => !p).length >= 2 &&
    h.river.split(",").length >= PLAYERS.length
  );
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
  if (gotToShowdown) {
    const playersInHand = h.pFolded.map(p => !p);

    const scores = h.pCards
      .filter((cards, i) => playersInHand[i])
      .map(cards => Hand.solve(cards.concat(board)));
    showdown = scores.map(s => s.descr);

    const showdownWinnerCards = Hand.winners(scores);
    showdownWinner = h.pCards.findIndex(c => c === showdownWinnerCards[0]); //for now, ties are not explored
  }

  const whoDidnt = h.pFolded.findIndex(a => !a);

  const onlyPlayerLeft = allOthersFolded(h) ? whoDidnt : -1;

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
  const lastBettingRoundActions =
    h.bettingRound === BETTING_ROUND_RIVER
      ? h.river
      : h.bettingRound === BETTING_ROUND_TURN
      ? h.turn
      : h.bettingRound === BETTING_ROUND_FLOP
      ? h.flop
      : h.bettingRound === BETTING_ROUND_PREFLOP
      ? h.preflop
      : "";

  const everyoneDidAction =
    lastBettingRoundActions.split(",").length - 1 >= PLAYERS.length;

  const playersLeft = h.pFolded.map(a => !a);

  const playerBets = h.pBet.filter((betSize, i) => playersLeft[i]);

  const equalBets = allEqual(playerBets);

  const needsChanceCard = everyoneDidAction && equalBets;

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
  const currentPlayer =
    infoSet.split(",").filter(a => ALL_ACTIONS.includes(a)).length %
    PLAYERS.length;
  return currentPlayer;
}

function getInformationSet(h, p) {
  const actions = getActions(h);
  const infoSet =
    p +
    ":preflop:" +
    h.preflop +
    "[" +
    h.board[0] +
    h.board[1] +
    h.board[2] +
    "]" +
    ":flop:" +
    h.flop +
    "[" +
    h.board[3] +
    "]" +
    ":turn:" +
    h.turn +
    "[" +
    h.board[4] +
    "]" +
    ":river:" +
    h.river;

  let I = treeMap[infoSet];
  if (!I) {
    //if undefined, create new and return that one

    treeMap[infoSet] = {
      infoSet,
      regretSum: actions.map(a => 0),
      strategy: actions.map(a => 1 / actions.length),
      actionCounter: actions.map(a => 0)
    };

    I = treeMap[infoSet];
  } else {
    // console.log("we found an I that already has been declared!", I);
  }

  // console.log("infoSet", infoSet, "Found");
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
  const hasChips = h.pChips[h.currentPlayer] > 0;
  const hasFolded = h.pFolded[h.currentPlayer];

  let actions = [];

  if (hasFolded) {
    actions = ["none"];
  } else {
    if (betsAreEqual) {
      actions = ["check"];
      if (hasChips) {
        actions = actions.concat(["bet1"]); //bet2
      }
    } else {
      actions = ["fold", "call"];

      if (hasChips) {
        actions = actions.concat(["bet1"]); //bet2
      }
    }
  }

  return actions;
}

function doAction(h, action, p) {
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
    case "bet1":
      const potSize = ha.chips + ha.pBet.reduce((a, b) => a + b, 0);

      let betSize = potSize;
      if (ha.pChips[ha.currentPlayer] < betSize) {
        betSize = ha.pChips[ha.currentPlayer];
      }

      ha.pChips[ha.currentPlayer] = ha.pChips[ha.currentPlayer] - betSize;
      ha.pMPIP[ha.currentPlayer] = ha.pMPIP[ha.currentPlayer] + betSize;
      ha.pBet[ha.currentPlayer] = betSize;

      ha.log = ha.log.concat([
        "Player " + ha.currentPlayer + " bets " + betSize
      ]);

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
    strategySum += strategy[i];

    if (c < strategySum) {
      return i;
    }
  }
}

function getBettingRound(I) {
  const chanceSequence = I.infoSet
    .split(",")
    .filter(action => !ALL_ACTIONS.includes(action));

  const boardCards = chanceSequence.length / 2;

  if (boardCards === 0) {
    return 0;
  } else if (boardCards === 3) {
    return 1;
  } else if (boardCards === 4) {
    return 2;
  } else {
    return 3;
  }
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
  const unshuffledDeck = ranks
    .map(rank => rank + "h")
    .concat(ranks.map(rank => rank + "d"))
    .concat(ranks.map(rank => rank + "c"))
    .concat(ranks.map(rank => rank + "s"));

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
    pChips: PLAYERS.map(p => (p === 0 ? 9950 : p === 1 ? 9900 : 10000)),
    pCards: PLAYERS.map(p => [deck.pop(), deck.pop()]),
    pMPIP: PLAYERS.map(p => (p === 0 ? 50 : p === 1 ? 100 : 0)),
    pBet: PLAYERS.map(p => (p === 0 ? 50 : p === 1 ? 100 : 0)),
    deck: deck.slice(),
    depth: 0,
    currentPlayer: 2,
    showdown: [],
    winner: undefined
  });

  return emptyHistory;
}

//MCCFR with pruning for very negative regrets
function traverseMCCFR_P(h, p) {
  console.log("traversemccfr-p", p);
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
    for (let a = 0; a < actions.length; a++) {
      if (explored[a] === true) {
        const newRegret = I.regretSum.map((r, i) =>
          a === i ? r + va[a] - v : r
        );
        const node = { ...I, regretSum: newRegret };

        treeMap[I.infoSet] = node;
      }
    }
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
  if (isTerminal(h)) {
    const h2 = calculateWinner(h);
    const utility = getUtility(h2, p);
    // console.log("Terminal with utility", utility, "H", h);
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
    // console.log("You");
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

    for (let a = 0; a < actions.length; a++) {
      const newRegret = I.regretSum.map((r, i) =>
        a === i ? r + va[a] - v : r
      );
      const node = { ...I, regretSum: newRegret };
      treeMap[I.infoSet] = node;
    }

    // console.log("we get here");

    return v;
  } else {
    const Ph = h.currentPlayer;
    // console.log("Player", Ph, "'s turn");
    const I = getInformationSet(h, Ph);
    const strategy = calculateStrategy(I.regretSum, h);
    const actions = getActions(h);
    const chosenAction = randomActionFromStrategy(strategy); //sample an action from the probability distribution

    let ha = doAction(h, actions[chosenAction], Ph);

    return traverseMCCFR(ha, p);
  }
}

/**
 * update the average strategy for Player i
 * @param {*} h history
 * @param {*} p Player i
 */
function updateStrategy(h, p) {
  console.log("updatestrategy", p);
  if (isTerminal(h) || !inHand(h, p) || h.bettingRound > 0) {
    console.log("isTerminal(h) || !inHand(h, p) || h.bettingRound > 0");
    //average strategy only tracked on the first betting round
    return;
  } else if (needsChanceNode(h)) {
    console.log("Needs chance node");
    //sample an action from the chance probabilities
    const ha = nextRound(h);
    updateStrategy(ha, p);
  } else if (h.currentPlayer === p) {
    console.log("getCurrentPlayer(h)====p");
    //if history ends with current player to act
    const I = getInformationSet(h, p); // the Player i infoset of this node . GET node?
    const strategyI = calculateStrategy(I.regretSum, h); //determine the strategy at this infoset
    const actions = getActions(h);
    const a = randomActionFromStrategy(strategyI); //sample an action from the probability distribution

    const actionCounter = I.actionCounter;
    actionCounter[a] = actionCounter[a] + 1;
    treeMap[I.infoSet] = { ...I, actionCounter }; //increment action counter

    const ha = doAction(h, actions[a], p);
    updateStrategy(ha, p);
  } else {
    const actions = getActions(h);
    console.log("ELSE", h);
    let ha;

    for (let a = 0; a < actions.length; a++) {
      ha = doAction(h, actions[a], p);
      updateStrategy(ha, p); //traverse each action
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
    sum = sum + R[a];
  }

  for (let a = 0; a < actions.length; a++) {
    if (sum > 0) {
      strategyI[a] = R[a] / sum;
    } else {
      strategyI[a] = 1 / actions.length;
    }
  }

  return strategyI;
}

function MCCFR_P(minutes = 1) {
  for (let p = 0; p < PLAYERS.length; p++) {
    Object.keys(treeMap).map(key => {
      const I = treeMap[key];
      if (getCurrentPlayerFromInfoSet(I.infoSet) === p) {
        const actions = getActionsFromInfoSet(I);
        let regretSum = [];
        let strategy = [];

        for (let a = 0; a < actions.length; a++) {
          regretSum[a] = 0;
          if (getBettingRound(I) === BETTING_ROUND_PREFLOP) {
            strategy[a] = 0; // 𝜙(Ii,a) = 0; not sure if this is correct
          }
        }
        treeMap[I.infoSet] = { ...I, regretSum, strategy };
      }
    });
  }

  var start = new Date();
  let iterations = 0;
  for (let t = 0; t / 60000 < minutes; t = new Date() - start) {
    iterations++;
    if (iterations % 1000 === 0) {
      console.log("iterations", iterations, "time", Math.round(t / 1000));
    }

    for (let p = 0; p < PLAYERS.length; p++) {
      // console.log("Player", p);
      const emptyHistory = initiateHistory(t);
      // if (t % STRATEGY_INTERVAL === 1) {
      //   updateStrategy(emptyHistory, p);
      // }

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
    if (t < LCFR_THRESHOLD && t % DISCOUNT_INTERVAL === 0) {
      const d = t / DISCOUNT_INTERVAL / (t / DISCOUNT_INTERVAL + 1);

      for (let p = 0; p < PLAYERS.length; p++) {
        Object.keys(treeMap).map(key => {
          const I = treeMap[key];
          if (getCurrentPlayerFromInfoSet(I.infoSet) === p) {
            const actions = getActionsFromInfoSet(I);
            let regretSum = I.regretSum;
            let strategy = I.strategy;
            for (let a = 0; a < actions.length; a++) {
              regretSum[a] = I.regretSum[a] * d;
              strategy[a] = I.strategy[a] * d;
            }
            treeMap[I.infoSet] = { ...I, regretSum, strategy };
          }
        });
      }
    }
  }
  console.log("end");
  return 0; // return 𝜙. must be strategy
}

MCCFR_P(1);

// Object.keys(treeMap).map(I => {
//   console.log(treeMap[I]);
// });

console.log("we have ", Object.keys(treeMap).length, "entries in the Object");

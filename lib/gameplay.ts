import { HandHistory } from "./HandHistory";
import { allEqual, shuffle } from "./util";
import Constants from "./Constants";
var Hand = require("pokersolver").Hand; //https://github.com/goldfire/pokersolver

export function nextRound(h: HandHistory) {
  h.bettingRound++;
  h.currentPlayer = 0;
  let cards: string[] = [];

  const rounds = ["Preflop", "Flop", "Turn", "River"];

  if (h.bettingRound === Constants.BETTING_ROUND_FLOP) {
    //draw flop
    cards = [h.deck.pop() || "", h.deck.pop() || "", h.deck.pop() || ""];
  } else if (h.bettingRound === Constants.BETTING_ROUND_TURN) {
    //draw turn or river
    cards = [h.deck.pop() || ""];
  } else if (h.bettingRound === Constants.BETTING_ROUND_RIVER) {
    cards = [h.deck.pop() || ""];
  }

  h.board = h.board.concat(cards);

  h.chips = h.chips + h.pBet.reduce((a, b) => a + b, 0);
  h.pBet = Constants.PLAYERS.map((p) => 0);
  if (h.bettingRound < Constants.BETTING_OVER) {
    h.log = h.log.concat([
      rounds[h.bettingRound] + " comes " + cards.join(","),
    ]);
  }
  return h;
}

export function allOthersFolded(h: HandHistory) {
  return h.pFolded.filter((p) => !p).length === 1;
}

export function isTerminal(h: HandHistory) {
  const isTerminal =
    allOthersFolded(h) || h.bettingRound === Constants.BETTING_OVER;
  return isTerminal;
}

export function haveShowdown(h: HandHistory) {
  const unfoldedMPIP = h.pMPIP.filter((p, i) => !h.pFolded[i]);
  return (
    h.board.length === 5 &&
    h.pFolded.filter((p) => !p).length >= 2 &&
    h.river.split(",").length >= Constants.PLAYERS.length
  );
}

export function getUtility(h: HandHistory, p: number) {
  const youWon = h.winner === p;
  if (youWon) {
    return h.chips;
  } else {
    const mpip = h.pMPIP[p];
    return -1 * mpip;
  }
}

export function calculateWinner(h: HandHistory): HandHistory {
  const board = h.board;

  let showdownWinner;
  const gotToShowdown = haveShowdown(h);
  let showdown: string[] = [];
  let whoDidnt;
  if (gotToShowdown) {
    const playersInHand = h.pFolded.map((p) => !p);

    const scores = h.pCards
      .filter((cards, i) => playersInHand[i])
      .map((cards) => Hand.solve(cards.concat(board)));
    showdown = scores.map((s) => s.descr);

    const showdownWinnerCards = Hand.winners(scores);
    showdownWinner = scores.findIndex(
      (score) => score.descr === showdownWinnerCards[0].descr
    ); //for now, ties are not explored

    h.log = h.log.concat([
      "Player " + showdownWinner + " wins with " + showdownWinnerCards[0].descr,
    ]);
  } else {
    whoDidnt = h.pFolded.findIndex((a) => !a);
    h.log = h.log.concat([
      "Player " + whoDidnt + " wins because everyone else folded",
    ]);
  }

  h.winner = showdownWinner ? showdownWinner : whoDidnt;
  h.showdown = showdown;
  return h;
}

export function inHand(h: HandHistory, p: number) {
  const playerFolded = h.pFolded;
  return !playerFolded[h.currentPlayer];
}

export function needsChanceNode(h: HandHistory): boolean {
  // since last chancenode , more than or equal to {PLAYERS.length} actions were taken
  // and all players left ( not action none, not action fold) have equal betsizes
  const lastBettingRoundActions =
    h.bettingRound === Constants.BETTING_ROUND_RIVER
      ? h.river
      : h.bettingRound === Constants.BETTING_ROUND_TURN
      ? h.turn
      : h.bettingRound === Constants.BETTING_ROUND_FLOP
      ? h.flop
      : h.bettingRound === Constants.BETTING_ROUND_PREFLOP
      ? h.preflop
      : "";

  const everyoneDidAction =
    lastBettingRoundActions.split(",").length > Constants.PLAYERS.length;

  const playersLeft = h.pFolded.map((a) => !a);

  const playerBets = h.pBet.filter((betSize, i) => playersLeft[i]);
  const playerChips = h.pChips.filter((betSize, i) => playersLeft[i]);

  const everyoneAllIn = playerChips.every((chips) => chips <= 0);

  const equalBets = allEqual(playerBets);

  const needsChanceCard = !!((everyoneDidAction || everyoneAllIn) && equalBets);

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

export function getCurrentPlayerFromInfoSet(infoSet: string) {
  const currentPlayer =
    infoSet.split(",").filter((a) => Constants.ALL_ACTIONS.includes(a)).length %
    Constants.PLAYERS.length;
  return currentPlayer;
}

export function getActionsInfoSet(h: HandHistory, p: number): string {
  const potSize = h.pMPIP.reduce((a, b) => a + b, 0);
  const totalChips = Constants.PLAYERS.length * Constants.STARTING_STACK;
  const potSizeBuckets = Math.floor((potSize / totalChips) * 10); //expect to be 0-9, linear to potSize/totalChips ratio

  const playersRemain = h.pFolded
    .map((folded) => (folded ? "0" : "1"))
    .reduce((a, b) => a + b, ""); // expect to be 010101 in order of position so 2^players combinations

  const allBetsSize = h.pBet.reduce((a, b) => a + b, 0);
  const potSizeWithBets = potSize + allBetsSize;
  const myBet = h.pBet[p];
  const biggestBet = Math.max(...h.pBet);
  const toCall = biggestBet - myBet;
  const potOdds = toCall / potSizeWithBets;
  const potOddsBuckets = Math.floor(potOdds * 10); //expect it to be 0-9

  const positions = Constants.PLAYERS.map(
    (p, i) => Constants.PLAYERS.length - i
  ); //for six players, expect to be [5,4,3,2,1,0]
  let myPosition = positions[p]; //0 is sb, players.length is dealer. so the higher the better. however, sometimes, you're in position depending on other players folded. this has to be taken into account. Therefore, 0 should be in position. then substract players that have folded
  for (let pl = p + 1; pl < Constants.PLAYERS.length; pl++) {
    if (h.pFolded[pl]) {
      myPosition--;
    }
  }
  //expect myposition to be 0 if in position, 1 if almost in position, etc. so 0-8 for 9 players

  const bettingRound = h.bettingRound;

  const actionsString =
    bettingRound +
    "," +
    myPosition +
    "," +
    potOddsBuckets +
    "," +
    potSizeBuckets +
    "," +
    playersRemain; //expect it to be something like 1023,000111

  return actionsString;
}

export function getHandStrength(ourCards: string[], board: string[]) {
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

export function getBoardStrength(
  cards: string[],
  bettingRound: number
): string {
  const cardsWithoutSuit = cards.map((card) => card.charAt(0));
  const cardCount = cardsWithoutSuit.map(
    (rank) => cardsWithoutSuit.filter((rank2) => rank2 === rank).length
  );
  let pairs = "X";
  const hasPair = cardCount.filter((c) => c === 2).length;
  const hasTrips = cardCount.filter((c) => c === 3).length;
  const hasQuads = cardCount.filter((c) => c === 4).length;
  if (cardCount.every((x) => x === 1)) {
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

  const cardSuits = cards.map((card) => card.charAt(1));
  const suitCount = cardSuits.map(
    (suit1) => cardSuits.filter((suit2) => suit2 === suit1).length
  );
  let flushiness = "Y";
  const hasTwoSuits = suitCount.filter((s) => s === 2).length;
  const hasThreeSuits = suitCount.filter((s) => s === 3).length;
  const hasFourSuits = suitCount.filter((s) => s === 4).length;
  const hasFlush = suitCount.filter((s) => s === 5).length;

  if (suitCount.every((amount) => amount === 1)) {
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

  const cardsWithoutSuitWithoutPairs = cardsWithoutSuit.filter(
    (c, i) => cardsWithoutSuit.findIndex((c2) => c2 === c) === i
  );

  const ranksWithoutSuitWithoutPairs = cardsWithoutSuitWithoutPairs.map(
    (card) => {
      if (card === "A") return 14;
      if (card === "K") return 13;
      if (card === "Q") return 12;
      if (card === "J") return 11;
      return Number(card);
    }
  );

  const sorted = ranksWithoutSuitWithoutPairs.sort(); //something like 8 10 12 or 8 10

  const diff = sorted
    .map((rank, i) => (sorted[i + 1] ? sorted[i + 1] - rank : undefined))
    .filter((diff) => !!diff); //something like 1,1,1,1 for a straight
  const diffString = diff.join("");
  let straightiness = "Z";

  if (diff.every((d) => d === 1) && sorted.length === 5) {
    //straight on board
    straightiness = "5";
  } else if (diffString.includes("111")) {
    //open ended on board
    straightiness = "4";
  } else if (
    diffString.includes("112") ||
    diffString.includes("121") ||
    diffString.includes("211")
  ) {
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

/**
 * get all actions that are currently possible
 * @param {*} h history
 */
export function getActions(h: HandHistory): string[] {
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

export function doAction(
  h: HandHistory,
  action: string,
  p: number
): HandHistory {
  if (!action) {
    console.log("Action is ", action);
  }

  const ha = new HandHistory(h);

  ha.depth++;

  switch (ha.bettingRound) {
    case Constants.BETTING_ROUND_PREFLOP:
      ha.preflop = ha.preflop + ha.currentPlayer + action + ",";
      break;
    case Constants.BETTING_ROUND_FLOP:
      ha.flop = ha.flop + ha.currentPlayer + action + ",";
      break;
    case Constants.BETTING_ROUND_TURN:
      ha.turn = ha.turn + ha.currentPlayer + action + ",";
      break;
    case Constants.BETTING_ROUND_RIVER:
      ha.river = ha.river + ha.currentPlayer + action + ",";
      break;
    case Constants.BETTING_OVER:
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

      const highestBet = Math.max(...ha.pBet);
      const myBet = ha.pBet[ha.currentPlayer];
      const diff = highestBet - myBet;

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

      ha.log = ha.log.concat([
        "Player " + ha.currentPlayer + " bets " + betSize,
      ]);

      break;
  }

  ha.currentPlayer = (ha.currentPlayer + 1) % Constants.PLAYERS.length;

  return ha;
}

export function initiateHistory(ms: number): HandHistory {
  const unshuffledDeck = Constants.RANKS.map((rank) => rank + "h")
    .concat(Constants.RANKS.map((rank) => rank + "d"))
    .concat(Constants.RANKS.map((rank) => rank + "c"))
    .concat(Constants.RANKS.map((rank) => rank + "s"));

  const deck = shuffle(unshuffledDeck);

  const emptyHistory = new HandHistory({
    preflop: "",
    flop: "",
    turn: "",
    river: "",
    over: "",
    log: [],
    bettingRound: 0,
    board: [],
    chips: 150,
    pLastAction: Constants.PLAYERS.map((p) => null),
    pFolded: Constants.PLAYERS.map((p) => false),
    pChips: Constants.PLAYERS.map((p) =>
      p === 0
        ? Constants.STARTING_STACK - 50
        : p === 1
        ? Constants.STARTING_STACK - 100
        : Constants.STARTING_STACK
    ),
    pCards: Constants.PLAYERS.map((p) => [deck.pop(), deck.pop()]),
    pMPIP: Constants.PLAYERS.map((p) => (p === 0 ? 50 : p === 1 ? 100 : 0)),
    pBet: Constants.PLAYERS.map((p) => (p === 0 ? 50 : p === 1 ? 100 : 0)),
    deck: deck.slice(),
    depth: 0,
    currentPlayer: Constants.PLAYERS.length > 2 ? 2 : 1,
    showdown: [],
    winner: undefined,
  });

  return emptyHistory;
}

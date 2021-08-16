import Constants from "./Constants";
import {
  calculateWinner,
  doAction,
  getActions,
  getUtility,
  inHand,
  initiateHistory,
  isTerminal,
  needsChanceNode,
  nextRound,
} from "./gameplay";
import { getInformationSet, writeInformationSet } from "./infoSet";
import { HandHistory } from "./HandHistory";
import { InfoSetData } from "./InfoSetData";

/**
 * returns number of action based on strategy distribution
 */
function randomActionFromStrategy(strategy: number[]): number {
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
  console.log("shouldnt get here");
  return 0;
}

function isPreflop(I: InfoSetData) {
  I.infoSet.length < 10; //to be determined. preflop infoset keys are shorter, but the bettinground is also included in the infoset.
}

function getActionsFromInfoSet(I: InfoSetData) {
  //1 get current round actions
  //2 see if they're equal
  return [];
}

//MCCFR with pruning for very negative regrets
function traverseMCCFR_P(h: HandHistory, p: number): number {
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
      if (I.regretSum[a] > Constants.C) {
        const ha = doAction(h, actions[a], p);
        va[a] = traverseMCCFR_P(ha, p);
        explored[a] = true;
        v = v + strategyI[a] * va[a];
      } else {
        explored[a] = false;
      }
    }
    let newRegret = [];
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
function traverseMCCFR(h: HandHistory, p: number): number {
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
function updateStrategy(h: HandHistory, p: number, depth: number) {
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
function calculateStrategy(R: number[], h: HandHistory) {
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

export function MCCFR_P(minutes = 1) {
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

  var start = Date.now();
  let iterations = 0;
  for (let t = 0; t / 60000 < minutes; t = Date.now() - start) {
    iterations++;
    if (iterations % 1000 === 0) {
      console.log("iterations", iterations, "time", Math.round(t / 1000));
    }

    const emptyHistory = initiateHistory(t);

    for (let p = 0; p < Constants.PLAYERS.length; p++) {
      // console.log("Player", p);
      if (t % Constants.STRATEGY_INTERVAL === 1) {
        updateStrategy(emptyHistory, p, 0);
      }

      if (t / 60000 > Constants.PRUNE_THRESHOLD) {
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
    if (
      t < Constants.LCFR_THRESHOLD &&
      (t / 60000) % Constants.DISCOUNT_INTERVAL === 0
    ) {
      const m = t / 60000;
      const d =
        m / Constants.DISCOUNT_INTERVAL / (m / Constants.DISCOUNT_INTERVAL + 1);

      for (let p = 0; p < Constants.PLAYERS.length; p++) {
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

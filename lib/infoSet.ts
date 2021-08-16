import Constants from "./Constants";
import {
  getActions,
  getActionsInfoSet,
  getBoardStrength,
  getHandStrength,
} from "./gameplay";
import { HandHistory } from "./HandHistory";
import { InfoSetData } from "./InfoSetData";
const fs = require("fs");

const redis = require("redis");
export const client = redis.createClient();

const { promisify } = require("util");
const redisGetAsync = promisify(client.get).bind(client);

export const treeMap: { [key: string]: InfoSetData } = {};

export function writeInformationSet(infoSet: string, data: InfoSetData): void {
  //@ts-ignore
  if (Constants.MEMORY_TYPE === "fs") {
    fs.writeFileSync("./data/" + infoSet + ".json", JSON.stringify(data));
    //@ts-ignore
  } else if (Constants.MEMORY_TYPE === "redis") {
    client.set(infoSet, JSON.stringify(data));
  } else {
    treeMap[infoSet] = data;
  }
}
/**
 * gets InfoSetData for a player in a handhistory
 * @param h HandHistory
 * @param p player number
 * @returns
 */
export async function getInformationSet(
  h: HandHistory,
  p: number
): Promise<InfoSetData> {
  const actions = getActions(h);

  let infoSet;

  const actionsInfoSet = getActionsInfoSet(h, p);

  if (h.bettingRound === Constants.BETTING_ROUND_PREFLOP) {
    const card1 = h.pCards[p][0].charAt(0);
    const card2 = h.pCards[p][1].charAt(0);
    const first = card1 < card2 ? card1 : card2;
    const second = card1 < card2 ? card2 : card1;

    const cards =
      first +
      second +
      (h.pCards[p][0].charAt(1) === h.pCards[p][1].charAt(1) ? "s" : "o");

    infoSet = cards + actionsInfoSet;
  } else {
    const handStrength = getHandStrength(h.pCards[p], h.board);
    const boardStrength = getBoardStrength(h.board, h.bettingRound);

    infoSet = handStrength + "," + boardStrength + "," + actionsInfoSet;
  }

  // console.log("infoset", infoSet);
  let I = undefined;

  const newI = {
    infoSet,
    regretSum: actions.map((a) => 0),
    strategy: actions.map((a) => 1 / actions.length),
    actionCounter: actions.map((a) => 0),
  };

  //@ts-ignore
  if (Constants.MEMORY_TYPE === "fs") {
    try {
      I = JSON.parse(fs.readFileSync("./data/" + infoSet + ".json"));
      if (I) {
        //console.log("I!!!", I);
      }
    } catch (e) {
      //if undefined, create new and return that one

      const data = (I = newI);

      fs.writeFileSync("./data/" + infoSet + ".json", JSON.stringify(data));

      I = data;
    }
    //@ts-ignore
  } else if (Constants.MEMORY_TYPE === "redis") {
    I = JSON.parse(await redisGetAsync(infoSet));
    if (!I) {
      I = newI;
    } // else {
    // console.log("IIIII", I);
    //}
  } else {
    I = treeMap[infoSet];

    if (!I) {
      I = newI;
    }
  }

  return I;
}

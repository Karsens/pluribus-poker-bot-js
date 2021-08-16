const ALL_ACTIONS = ["fold", "call", "check", "none", "bet"]; //bet2
const STARTING_STACK = 10000;

const BETTING_ROUND_PREFLOP = 0;
const BETTING_ROUND_FLOP = 1;
const BETTING_ROUND_TURN = 2;
const BETTING_ROUND_RIVER = 3;
const BETTING_OVER = 4;
const PLAYERS = [0, 1, 2];
const RANKS = [6, 7, 8, 9, "T", "J", "Q", "K", "A"]; //for starters, play with 20 cards.

const STRATEGY_INTERVAL = 1000; //10000 for pluribus
const PRUNE_THRESHOLD = 200;
const LCFR_THRESHOLD = 400;
const DISCOUNT_INTERVAL = 2; //10 in pluribus
const C = -300000000;

//CONFIG
const MEMORY_TYPE: "fs" | "object" | "memcached" | "redis" | "workers" =
  "object";

export default {
  ALL_ACTIONS,
  STARTING_STACK,
  BETTING_OVER,
  BETTING_ROUND_FLOP,
  BETTING_ROUND_PREFLOP,
  BETTING_ROUND_RIVER,
  BETTING_ROUND_TURN,
  PLAYERS,
  RANKS,
  STRATEGY_INTERVAL,
  PRUNE_THRESHOLD,
  LCFR_THRESHOLD,
  DISCOUNT_INTERVAL,
  C,
  MEMORY_TYPE,
};

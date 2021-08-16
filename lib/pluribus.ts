import { MCCFR_P } from "./algorithm";
import { treeMap } from "./infoSet";
MCCFR_P(1);

console.log("we have ", Object.keys(treeMap).length, "entries in the Object");

import { MCCFR_P } from "./algorithm";
import { treeMap } from "./infoSet";
import Constants from "./Constants";
import { client } from "./infoSet";

client.on("error", function (error: any) {
  console.error("ERROR", error);
});

client.on("ready", function (log: any) {
  MCCFR_P(10);
});

//@ts-ignore
if (Constants.MEMORY_TYPE === "redis") {
  client.dbsize(function (err: any, numKeys: number) {
    console.log("redis has ", numKeys);
  });
  //@ts-ignore
} else if (Constants.MEMORY_TYPE === "fs") {
  console.log("check filesystem for results");
} else {
  console.log("we have ", Object.keys(treeMap).length, "entries in the Object");
}

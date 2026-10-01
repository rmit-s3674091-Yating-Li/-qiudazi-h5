import { execFileSync } from "node:child_process";
const files=[
  "qa/candidate-browser-blackbox.mjs",
  "qa/candidate-full-lifecycle.mjs",
  "qa/exploratory-browser-blackbox.mjs",
  "qa/aud015-doubles-partner-blackbox.mjs"
];
for(const file of files){
  execFileSync(process.execPath,["--check",file],{stdio:"inherit"});
}
console.log("Browser QA harness syntax checks passed");

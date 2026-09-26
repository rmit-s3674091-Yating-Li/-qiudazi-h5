import fs from "node:fs";
const exp=fs.readFileSync("qa/exploratory-browser-blackbox.mjs","utf8");
const expect=(v,m)=>{if(!v)throw new Error(m);};
expect(exp.includes("async function businessShellReady"),"Exploratory must have strict business-shell readiness");
expect(exp.includes("/#\\/events(?:$|\\?)/.test(url)"),"Exploratory identity must require events route");
expect(exp.includes("!url.includes('/profile')"),"Exploratory identity must reject profile redirects");
expect(exp.includes("Restoring your Qiu Dazi identity"),"Exploratory identity must reject restoring state");
expect(!exp.includes("await page.locator('a[href=\"#/quick-start\"]').first().waitFor({state:'visible',timeout:7000});return;"),"Quick-start link alone must never prove identity readiness");
console.log("Exploratory identity readiness contract passed");

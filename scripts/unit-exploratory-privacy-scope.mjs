import fs from "node:fs";
const exp=fs.readFileSync("qa/exploratory-browser-blackbox.mjs","utf8");
const expect=(v,m)=>{if(!v)throw new Error(m);};
expect(exp.includes("getByRole('heading',{name:/^(Event album visibility|参与赛事相册可见范围)$/})"),"Privacy exploratory check must anchor to the album-visibility heading");
expect(exp.includes("const albumSection=albumHeading.locator('xpath=..')"),"Album visibility buttons must be scoped to the heading's own section");
expect(!exp.includes("filter({has:p.locator('.segmented')}).last()"),"Privacy check must not race against the always-visible language segmented control");
console.log("Exploratory privacy scope contract passed");

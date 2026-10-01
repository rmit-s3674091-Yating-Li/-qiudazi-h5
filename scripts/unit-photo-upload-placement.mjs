import fs from "node:fs";
const panel=fs.readFileSync("src/components/TournamentPanels.tsx","utf8");
const css=fs.readFileSync("src/polish.css","utf8");
const expect=(v,m)=>{if(!v)throw new Error(m);};
expect(panel.includes('className="button photo-upload-inline"'),"empty event album upload must live inside the empty state");
expect(panel.includes('className="text-button photo-upload-compact"'),"non-empty album upload must be a compact section action");
expect(!panel.includes('className="photo-upload-row"'),"orphaned bottom-right upload row must be removed");
expect(css.includes(".photo-section-toolbar"),"photo upload section action needs dedicated layout");
console.log("Event photo upload placement contract passed");

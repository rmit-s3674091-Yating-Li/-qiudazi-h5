import fs from "node:fs";
const event=fs.readFileSync("src/pages/EventPage.tsx","utf8");
const expect=(v,m)=>{if(!v)throw new Error(m);};
expect(event.includes('e.status==="finished"?txt("赛事已结束","Event finished")'),"finished participant status must become post-event, not registered");
expect(event.includes('txt("你参加了本场赛事，可查看最终赛果。","You played in this event. View the final results.")'),"finished status must explain the next meaningful task");
expect(event.includes('e.status==="finished"?(own||owner)&&<button className="grow" onClick={()=>setTab("ranking")}>{txt("查看赛果","View results")}</button>'),"finished event primary CTA must lead to results");
expect(!event.includes('e.status==="finished"&&<button className="grow" onClick={()=>showRoster()'),"finished event must not promote roster as primary CTA");
console.log("Finished event CTA lifecycle contract passed");

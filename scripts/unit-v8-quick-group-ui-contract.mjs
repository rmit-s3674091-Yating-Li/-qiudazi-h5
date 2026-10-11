import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/pages/QuickStartPage.tsx", "utf8");
assert.match(source, /value="group_knockout"/, "Quick Start must expose group + knockout");
assert.match(
  source,
  /isValidQuickGroupConfig\(entries\.length,groupCount,qualifiersPerGroup\)/,
  "Group validation must use entries, not raw player count",
);
assert.match(
  source,
  /disabled=\{busy\|\|!validSelection\|\|!groupConfigValid\}/,
  "Invalid group configuration must block creation",
);
assert.match(
  source,
  /format==="group_knockout"\?\{group_count:groupCount,qualifiers_per_group:qualifiersPerGroup\}:\{\}/,
  "Only group format may send group parameters to the RPC",
);
assert.match(
  source,
  /pendingDraw\)\{await finishDraw\(pendingDraw\);return;\}/,
  "Pending Quick draw recovery must remain first",
);
assert.match(source, /<option value="points_15">/, "Quick scoring must retain the supported 15-point preset");
console.log("V8 quick group + knockout UI contract passed");

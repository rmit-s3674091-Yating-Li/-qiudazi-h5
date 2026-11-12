import { sourceContractText } from "./source-contract-text.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile("src/components/VenueMapPicker.tsx", "utf8");
const parsed = ts.createSourceFile(
  "VenueMapPicker.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const effects = [];
function visit(node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(parsed) === "useEffect"
  )
    effects.push(sourceContractText(node.getText(parsed)));
  ts.forEachChild(node, visit);
}
visit(parsed);
assert.ok(
  effects.some(
    (effect) =>
      effect.includes("initialSearchStarted.current") &&
      effect.includes("initialVenueName||initialAddress") &&
      effect.includes("searchPlaces(initialTerm)"),
  ),
  "pre-filled venue or address should trigger initial search on picker mount",
);
assert.ok(
  sourceContractText(source).includes(
    'const[query,setQuery]=useState(initialVenueName||initialAddress||""',
  ),
  "prefilled term should be visible in search input",
);
const normalized = sourceContractText(source);
assert.ok(
  normalized.includes("onSubmit={e=>{e.preventDefault();setSearchOpen(true);voidsearchPlaces()}}"),
  "search form submission should explicitly trigger search",
);
assert.ok(
  !normalized.includes("setSearchFocused("),
  "removed focus state must not be referenced",
);
assert.ok(
  !effects.some((effect) => effect.includes("searchFocused")),
  "input typeahead effect must stay removed",
);
console.log(
  "PASS: initial prefill search and explicit submit retained; typeahead disabled",
);

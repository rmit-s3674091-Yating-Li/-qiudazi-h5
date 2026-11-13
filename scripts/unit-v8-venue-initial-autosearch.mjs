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

assert.ok(normalized.includes("!addressNeedsConfirmation"), "changed pin must require address review");
assert.ok(normalized.includes("address:manualAddress.trim()"), "cleared address must not fall back to saved address");
assert.ok(normalized.includes('setReverseAddressSuggestion(found?.address||"")'), "reverse lookup must remain a suggestion");

assert.ok(normalized.includes("start=latestPosition.current??fallback"), "delayed Leaflet must use latest selection");
assert.equal((normalized.match(/latestPosition\.current=next;setPosition\(next\)/g)||[]).length, 3, "all three position writers must update the ref synchronously");
assert.ok(normalized.includes("onConfirmManual(manualName.trim(),manualAddress.trim())"), "manual confirmation must not require coordinates");
const formSource = sourceContractText(await readFile("src/pages/EventFormPage.tsx", "utf8"));
assert.ok(formSource.includes("onConfirmManual={(name,address)=>{setForm(f=>({...f,venue_name:name||null,venue_address:address||null,venue_latitude:null,venue_longitude:null,venue_place_id:null,venue_provider:null}))"), "manual confirmation must preserve other fields and clear old location identity");
console.log("PASS: latest position and manual confirmation source contracts");

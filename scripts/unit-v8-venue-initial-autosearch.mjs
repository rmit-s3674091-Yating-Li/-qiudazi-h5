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
      effect.includes("queueMicrotask(") &&
      effect.includes("active=false") &&
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

// Execute the actual mount effect with controlled microtasks and cleanup.
const mountEffects = [];
function scan(node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(parsed) === "useEffect" &&
    node.getText(parsed).includes("searchPlaces(initialTerm)")
  ) {
    mountEffects.push(node.arguments[0].getText(parsed));
  }
  ts.forEachChild(node, scan);
}
scan(parsed);
assert.equal(mountEffects.length, 1);
function exercise(name, address, replay, unmount) {
  const tasks = [];
  const calls = [];
  const setup = new Function(
    "initialVenueName",
    "initialAddress",
    "searchPlaces",
    "queueMicrotask",
    `return (${mountEffects[0]})();`,
  );
  const mount = () =>
    setup(name, address, (term) => calls.push(term), (task) => tasks.push(task));
  let cleanup = mount();
  if (replay) {
    cleanup();
    cleanup = mount();
  }
  if (unmount) cleanup();
  tasks.forEach((task) => task());
  return calls;
}
assert.deepEqual(exercise("奥森", "", true, false), ["奥森"]);
assert.deepEqual(exercise("", "绿心公园", false, false), ["绿心公园"]);
assert.deepEqual(exercise("奥森", "", false, true), []);
assert.deepEqual(exercise("", "", true, false), []);
console.log("PASS: initial search effect replay and unmount behavior");


// H5_CONFIRMATION_BEHAVIOR_20261115
// H5_REOPEN_POI_20261115
// Evaluate the actual state initializer and JSX callbacks.
const initializers = [];
const handlers = [];
function scanConfirmation(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === "[place, setPlace]") {
    initializers.push(node.initializer.arguments[0].getText(parsed));
  }
  if (ts.isJsxAttribute(node) && node.name.getText(parsed) === "onClick") {
    const expression = node.initializer?.expression;
    if (expression?.getText(parsed).includes("onConfirm(position.lat")) {
      handlers.push(expression.getText(parsed));
    }
  }
  ts.forEachChild(node, scanConfirmation);
}
scanConfirmation(parsed);
assert.equal(initializers.length, 1);
assert.equal(handlers.length, 1);
const restore = new Function("initialLatitude", "initialLongitude", "initialPlaceId", "initialProvider", "initialVenueName", "initialAddress", "return (" + initializers[0] + ");");
const restored = restore(39.99, 116.39, "saved-poi", "openstreetmap_nominatim", " 奥森 ", " 北京市朝阳区 ");
assert.deepEqual(restored, { name: "奥森", address: "北京市朝阳区", provider: "openstreetmap_nominatim", placeId: "saved-poi" });
assert.equal(restore(null, 116.39, "saved-poi", "openstreetmap_nominatim", "奥森", "地址"), null);
assert.equal(restore(39.99, 116.39, "saved-poi", "manual_pin", "奥森", "地址"), null);
assert.equal(restore(39.99, 116.39, null, "openstreetmap_nominatim", "奥森", "地址"), null);
const confirm = new Function("position", "canConfirm", "place", "manualName", "manualAddress", "onConfirm", "return (" + handlers[0] + ")();");
const calls = [];
const pin = { lat: 39.99, lng: 116.39 };
const capture = (...args) => calls.push(args);
confirm(pin, true, restored, " 奥森 ", " 北京市朝阳区 ", capture);
assert.deepEqual(calls.pop(), [39.99, 116.39, restored]);
confirm(pin, true, restored, "奥森", "新地址", capture);
assert.deepEqual(calls.pop()[2], { name: "奥森", address: "新地址", provider: "manual_pin", placeId: null });
confirm(pin, true, null, "奥森", "", capture);
assert.deepEqual(calls.pop()[2], { name: "奥森", address: "", provider: "manual_pin", placeId: null });
confirm(pin, false, restored, "奥森", "地址", capture);
confirm(null, true, restored, "奥森", "地址", capture);
assert.equal(calls.length, 0);
assert.ok(formSource.includes("initialPlaceId={form.venue_place_id}"));
assert.ok(formSource.includes("initialProvider={form.venue_provider}"));
console.log("PASS: saved POI initialization and confirmation identity");

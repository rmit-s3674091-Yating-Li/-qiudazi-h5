import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source=await readFile("src/components/VenueMapPicker.tsx","utf8");
const parsed=ts.createSourceFile("VenueMapPicker.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const effects=[];
function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(parsed)==="useEffect")effects.push(node.getText(parsed));ts.forEachChild(node,visit)}
visit(parsed);
assert.ok(effects.some(effect=>effect.includes("initialSearchStarted.current")&&effect.includes("initialVenueName||initialAddress")&&effect.includes("searchPlaces(initialTerm)")),"pre-filled venue or address should trigger initial search on picker mount");
assert.ok(effects.some(effect=>effect.includes("searchFocused")&&effect.includes("searchPlaces(term)")),"manual debounced search must remain");
assert.ok(source.includes("const[query,setQuery]=useState(initialVenueName||initialAddress||\"\""),"prefilled term should be visible in search input");
console.log("PASS: prefilled venue triggers initial POI search without focus; manual search retained");

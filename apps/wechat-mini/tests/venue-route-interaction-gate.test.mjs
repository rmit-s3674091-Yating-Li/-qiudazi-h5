import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OfflineRouteInteractionGate } from "../src/core/venue-route-interaction-gate.ts";

const page = () =>
  readFileSync(
    new URL("../src/pages/venue-route-poc/index.tsx", import.meta.url),
    "utf8",
  );

test("editing starts unlocked and allows one confirmation only", () => {
  const gate = new OfflineRouteInteractionGate();
  assert.equal(gate.snapshot(), "editing");
  assert.equal(gate.canEdit(), true);
  assert.equal(gate.beginConfirm(), true);
  assert.equal(gate.beginConfirm(), false);
  assert.equal(gate.canEdit(), false);
});

test("cancel cannot race an in-flight navigateBack", () => {
  const gate = new OfflineRouteInteractionGate();
  gate.beginConfirm();
  assert.equal(gate.cancel(), false);
  assert.equal(gate.snapshot(), "confirming");
});

test("blocked navigation permits a safe explicit retry", () => {
  const gate = new OfflineRouteInteractionGate();
  gate.beginConfirm();
  gate.settleConfirm(false);
  assert.equal(gate.canEdit(), true);
  assert.equal(gate.beginConfirm(), true);
});

test("successful return remains terminal and cannot be re-submitted", () => {
  const gate = new OfflineRouteInteractionGate();
  gate.beginConfirm();
  gate.settleConfirm(true);
  assert.equal(gate.snapshot(), "returned");
  assert.equal(gate.beginConfirm(), false);
  assert.equal(gate.cancel(), false);
  assert.equal(gate.canEdit(), false);
});

test("cancel is one-shot and blocks future edits", () => {
  const gate = new OfflineRouteInteractionGate();
  assert.equal(gate.cancel(), true);
  assert.equal(gate.cancel(), false);
  assert.equal(gate.beginConfirm(), false);
  assert.equal(gate.snapshot(), "cancelled");
});

test("unload is terminal even if a pending confirmation later resolves", () => {
  const gate = new OfflineRouteInteractionGate();
  gate.beginConfirm();
  gate.unload();
  gate.settleConfirm(true);
  assert.equal(gate.snapshot(), "unloaded");
  assert.equal(gate.canEdit(), false);
});

test("late settle after cancellation never resurrects the page", () => {
  const gate = new OfflineRouteInteractionGate();
  gate.cancel();
  gate.settleConfirm(false);
  assert.equal(gate.snapshot(), "cancelled");
});

test("page guards all four inputs and candidate/manual actions", () => {
  const source = page();
  for (const setter of ["setQuery", "setName", "setAddress", "setCourt"]) {
    assert.match(
      source,
      new RegExp(
        `if \\(!interaction\\.current\\.canEdit\\(\\)\\) return;[\\s\\S]{0,150}${setter}\\(event\\.detail\\.value\\)`,
      ),
    );
  }
  assert.match(
    source,
    /if \(!interaction\.current\.canEdit\(\)\) return;\s*picker\.current\?\.chooseCandidate/,
  );
  assert.match(
    source,
    /if \(!interaction\.current\.canEdit\(\)\) return;\s*const \{ name: currentName, address: currentAddress \} =\s*latestInputs\.current\.manualValues\(\);\s*const ok\s*=\s*picker\.current\?\.useManual/,
  );
  assert.match(source, /disabled=\{locked\}/);
});

test("page refuses second back navigation while confirmation is in flight", () => {
  const source = page();
  assert.match(source, /if \(!interaction\.current\.cancel\(\)\) return;/);
  assert.match(
    source,
    /if \(!claimed \|\| !active \|\| !interaction\.current\.beginConfirm\(\)\) return;/,
  );
  assert.match(source, /interaction\.current\.settleConfirm\(returned\)/);
});

test("court uses latest synchronous value instead of stale React closure", () => {
  const source = page();
  assert.match(source, /latestCourt\.current = event\.detail\.value/);
  assert.match(source, /validateSpecificCourt\(latestCourt\.current\)/);
  assert.match(source, /latestCourt\.current = "";/);
});

test("page cannot create an event or imply verified auth", () => {
  const source = page();
  assert.match(source, /OFFLINE_MOCK_ONLY/);
  assert.doesNotMatch(
    source,
    /supabase\.from\(|wx\.login\(|service_role|code2Session/,
  );
});

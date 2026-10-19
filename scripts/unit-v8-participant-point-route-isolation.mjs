import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const dir = await mkdtemp(join(tmpdir(), "qiudazi-v8-point-route-"));
try {
  const source = await readFile("src/domain/PointQueueScope.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: "PointQueueScope.ts",
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const path = join(dir, "PointQueueScope.mjs");
  await writeFile(path, compiled.outputText, "utf8");
  const { advancePointQueueScope: advance, pointQueueScopeKey: key, samePointQueueScope: same } = await import(pathToFileURL(path).href);

  const first = { route: "event-A/match-1", generation: 0 };
  assert.equal(advance(first, first.route), first, "same match must preserve queue identity");
  const second = advance(first, "event-B/match-2");
  assert.deepEqual(second, { route: "event-B/match-2", generation: 1 });
  assert.equal(same(second, first), false, "late response from A cannot update B");
  const third = advance(second, first.route);
  assert.equal(same(third, first), false, "A-B-A navigation cannot revive an old A response");
  assert.equal(same(third, third), true);
  assert.equal(advance(third, third.route), third);

  const actorA = key("event-A/match-1", "auth-user-A");
  const actorB = key("event-A/match-1", "auth-user-B");
  const signedOut = key("event-A/match-1", null);
  assert.equal(actorA, key("event-A/match-1", "auth-user-A"), "JWT refresh for the same actor must preserve the queue");
  assert.notEqual(actorA, actorB, "same match with a different account must not reuse pending points");
  assert.notEqual(actorA, signedOut, "sign-out must invalidate in-flight points");
  assert.notEqual(signedOut, actorB, "sign-in must not inherit signed-out points");
  const beforeSwitch = { route: actorA, generation: 0 };
  const afterSwitch = advance(beforeSwitch, actorB);
  assert.equal(same(afterSwitch, beforeSwitch), false, "old actor's in-flight response must be ignored");
  assert.equal(same(advance(afterSwitch, actorA), beforeSwitch), false, "A-B-A account switching must not revive old responses");

  const page = await readFile("src/pages/MatchPage.tsx", "utf8");
  assert.match(page, /const \{session\}=useAuth\(\)/);
  assert.match(page, /const routeKey=pointQueueScopeKey\(\(id\?\?""\)\+"\/"\+\(matchId\?\?""\),session\?\.user\.id\)/);
  assert.match(page, /pointScope\.current=advancePointQueueScope\(pointScope\.current,routeKey\)/);
  assert.match(page, /pointFlush=useRef<number\|null>\(null\)/);
  assert.match(page, /while\(active\(\)\&\&pointQueue\.current\.length\)/);
  assert.match(page, /catch\(firstError\)\{\s*if\(!active\(\)\)return;\s*const reconciled=await q\.refresh\(\);\s*if\(!active\(\)\)return;/);
  assert.match(page, /if\(!active\(\)\)return;\s*latestSnapshot\.current=next;/);
  assert.match(page, /catch\(e\)\{\s*if\(!active\(\)\)return;\s*setOptimisticPoints/);
  assert.match(page, /if\(pointFlush\.current===scope\.generation\)pointFlush\.current=null/);
  assert.match(page, /q\.data\?\.event\.id===id\?q\.data:null/);
  assert.match(page, /pointQueue\.current=\[\];setOptimisticPoints\(\[\]\);latestSnapshot\.current=null/);
  const auth = await readFile("src/hooks/Auth.tsx", "utf8");
  assert.match(auth, /onAuthStateChange\(\(_event, next\) => \{ observeSession\(next\); \}\)/,
    "all auth events must pass the same account invalidation gate");
  assert.match(auth, /if \(changed\) \{[\s\S]*?clearQueryCache\(\);[\s\S]*?setProfile\(null\);/,
    "account switch clears private query cache and old profile");
  assert.match(auth, /identity\.current\.isCurrent\(userId, generation\)/,
    "late initial profile responses must not cross account generations");
  const accountSource = await readFile("src/domain/AuthAccountGeneration.ts", "utf8");
  const accountCompiled = ts.transpileModule(accountSource, {
    fileName: "AuthAccountGeneration.ts", reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  assert.equal(accountCompiled.diagnostics?.length ?? 0, 0);
  const accountPath = join(dir, "AuthAccountGeneration.mjs");
  await writeFile(accountPath, accountCompiled.outputText, "utf8");
  const { AuthAccountGeneration } = await import(pathToFileURL(accountPath).href);
  const account = new AuthAccountGeneration();
  const first = account.observe("actor-A");
  assert.equal(first.changed, true);
  assert.equal(account.observe("actor-A").changed, false, "JWT refresh keeps actor-scoped cache");
  assert.equal(account.isCurrent("actor-A", first.generation), true);
  const second = account.observe("actor-B");
  assert.equal(second.changed, true);
  assert.equal(account.isCurrent("actor-A", first.generation), false, "A profile response is stale after B login");
  account.observe("actor-A");
  assert.equal(account.isCurrent("actor-A", first.generation), false, "A-B-A cannot revive an old profile response");
  const signedOut = account.observe(null);
  assert.equal(signedOut.changed, true);
  assert.equal(account.observe(null).changed, false, "repeated sign-out does not repeatedly clear cache");
  console.log("PASS: V8 point queue route/account isolation and stale async guard");
} finally {
  await rm(dir, { recursive: true, force: true });
}

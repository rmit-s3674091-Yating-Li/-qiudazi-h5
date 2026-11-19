import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const tmp = await mkdtemp(join(tmpdir(), "qiudazi-v8-admin-policy-"));
try {
  const source = await readFile("src/domain/PlatformAdminActionPolicy.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: "PlatformAdminActionPolicy.ts",
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      verbatimModuleSyntax: true,
    },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0, "admin policy must transpile");
  const modulePath = join(tmp, "PlatformAdminActionPolicy.mjs");
  await writeFile(modulePath, compiled.outputText, "utf8");
  const { PLATFORM_ADMIN_ACTIONS: actions, evaluatePlatformAdminAction: evaluate } =
    await import(pathToFileURL(modulePath).href);

  const expected = {
    USER_RESTRICT: ["user", "high"],
    EVENT_CANCEL: ["event", "high"],
    SCORE_CORRECT: ["match", "high"],
    PHOTO_REMOVE: ["photo", "high"],
    VENUE_UPDATE: ["venue", "high"],
    COMMERCIAL_ORGANIZATION_VERIFY: ["commercial_organization", "high"],
    REPORT_RESOLVE: ["report", "low"],
    FEEDBACK_RESOLVE: ["feedback", "low"],
    ADMIN_MEMBER_CHANGE: ["admin_member", "high"],
  };
  assert.deepEqual(Object.keys(actions).sort(), Object.keys(expected).sort());
  const input = (action, role = "super_admin", overrides = {}) => ({
    action,
    role,
    targetKind: expected[action]?.[0] ?? "user",
    targetId: " target-1 ",
    reason: " Valid audit reason ",
    ...overrides,
  });
  for (const [action, [targetKind, risk]] of Object.entries(expected)) {
    assert.deepEqual(actions[action], { targetKind, risk });
    const granted = evaluate(input(action));
    assert.deepEqual(granted, {
      allowed: true,
      risk,
      action,
      targetKind,
      targetId: "target-1",
      reason: "Valid audit reason",
    });
    assert.deepEqual(evaluate(input(action, "reviewer")), {
      allowed: false,
      reason: "ROLE_FORBIDDEN",
    });
    assert.deepEqual(evaluate(input(action, null)), {
      allowed: false,
      reason: "ROLE_FORBIDDEN",
    });
    assert.equal(evaluate(input(action, "operator")).allowed, risk === "low");
    assert.deepEqual(evaluate(input(action, "super_admin", { targetKind: "other" })), {
      allowed: false,
      reason: "TARGET_MISMATCH",
    });
  }
  assert.deepEqual(evaluate(input("__proto__")), { allowed: false, reason: "UNKNOWN_ACTION" });
  assert.deepEqual(evaluate(input("ANY_DATABASE_UPDATE")), { allowed: false, reason: "UNKNOWN_ACTION" });
  assert.deepEqual(evaluate(input("EVENT_CANCEL", "super_admin", { targetId: "   " })), {
    allowed: false,
    reason: "TARGET_ID_INVALID",
  });
  assert.equal(evaluate(input("EVENT_CANCEL", "super_admin", { targetId: "x".repeat(129) })).allowed, false);
  assert.equal(evaluate(input("EVENT_CANCEL", "super_admin", { targetId: "😀".repeat(128) })).allowed, true);
  for (const reason of ["", "123456789", " ".repeat(15), "x".repeat(1001)]) {
    assert.deepEqual(evaluate(input("REPORT_RESOLVE", "operator", { reason })), {
      allowed: false,
      reason: "REASON_INVALID",
    });
  }
  assert.equal(evaluate(input("REPORT_RESOLVE", "operator", { reason: "😀".repeat(10) })).allowed, true);
  assert.equal(evaluate(input("REPORT_RESOLVE", "operator", { reason: "x".repeat(1000) })).allowed, true);

  // Protect the client-to-database action vocabulary from silent drift.
  const sql = await readFile("supabase/migrations/20261011190000_v8_platform_admin_audit_foundation.sql", "utf8");
  const sqlActions = sql.match(/action text not null check \(action in \(([\s\S]*?)\)\)/)?.[1] ?? "";
  const declared = [...sqlActions.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]).sort();
  assert.deepEqual(declared, Object.keys(expected).sort(), "SQL audit action vocabulary drift");
  for (const [action, [targetKind]] of Object.entries(expected)) {
    assert.ok(sql.includes(`(action='${action}' and target_kind='${targetKind}')`), `SQL target mismatch: ${action}`);
  }
  assert.match(sql, /when action in \('REPORT_RESOLVE','FEEDBACK_RESOLVE'\) then 'low' else 'high'/);
  assert.match(sql, /and v_role <> 'super_admin'/);
  console.log("V8 Platform Admin action policy and audit-schema parity passed");
} finally {
  await rm(tmp, { recursive: true, force: true });
}

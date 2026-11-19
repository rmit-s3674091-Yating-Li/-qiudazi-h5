import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkMiniBoundaries } from "../scripts/check-boundaries.mjs";

function fixture(source, relative = "core/example.ts") {
  const root = mkdtempSync(join(tmpdir(), "mini-secret-ast-"));
  const file = join(root, ...relative.split("/"));
  mkdirSync(join(root, ...relative.split("/").slice(0, -1)), {
    recursive: true,
  });
  writeFileSync(file, source);
  try {
    return { result: checkMiniBoundaries(root) };
  } catch (error) {
    return { error };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const blocked = (source) => {
  const { error } = fixture(source);
  assert.match(
    String(error),
    /Mini secret identifier forbidden: core\/example\.ts/,
  );
  assert.doesNotMatch(String(error), /credential-value/);
};

test("camelCase and uppercase secret-bearing identifiers fail closed", () => {
  for (const name of [
    "serviceRoleKey",
    "SUPABASE_SERVICE_ROLE_KEY",
    "WECHAT_APP_SECRET",
    "sessionKey",
    "SESSION_KEY",
    "appsecret",
  ]) {
    blocked(`const ${name} = 1;`);
  }
});

test("destructuring, properties and type aliases cannot hide secret identifiers", () => {
  blocked("const { sessionKey } = input;");
  blocked("const safe = { appSecret: 1 };");
  blocked("type ServiceRoleKey = string;");
  blocked("function run(WECHAT_APP_SECRET: string) { return 1; }");
});

test("Unicode escapes in identifier names are normalized by the TS parser", () => {
  blocked("const \\u0073essionKey = 1;");
});

test("comments and defensive strings are not newly rejected by AST identifier check", () => {
  assert.equal(
    fixture("// SESSION_KEY must never be shipped\nconst safe = 'SESSION_KEY';")
      .result,
    1,
  );
  assert.equal(
    fixture("const safe = { ordinaryKey: 'APP_SECRET' };").result,
    1,
  );
});

test("existing browser-only import and literal secret bans still apply", () => {
  assert.match(
    String(fixture('import "react-router-dom";').error),
    /Mini browser-only import/,
  );
  assert.match(
    String(fixture("const note = 'service_role';").error),
    /Mini boundary violation/,
  );
});

test("ordinary shared domain identifiers are allowed", () => {
  assert.equal(
    fixture("export const actorEpoch = 2; export const scoreVersion = 4;")
      .result,
    1,
  );
});

const browserBlocked = (source) => {
  const { error } = fixture(source);
  assert.match(
    String(error),
    /Mini browser global forbidden: core\/example\.ts/,
  );
};

test("globalThis dot and bracket browser globals are blocked", () => {
  for (const source of [
    "const x = globalThis.window;",
    'const x = globalThis["window"];',
    'const x = globalThis["document"];',
    'const x = globalThis["\\u0077indow"];',
    'const x = globalThis[("window")];',
    "const x = globalThis?.window;",
    "const x = globalThis[`window`];",
  ])
    browserBlocked(source);
});

test("bare DOM identifiers and computed browser access are blocked", () => {
  for (const source of [
    "const x = window;",
    "const x = document;",
    'const x = window["location"];',
    'const x = document["cookie"];',
    "const x = document?.body;",
  ])
    browserBlocked(source);
});

test("computed globalThis keys without a literal are rejected", () => {
  for (const source of [
    'const x = globalThis["win" + "dow"];',
    'const x = globalThis["doc" + "ument"];',
    'const x = globalThis["local" + "Storage"];',
    "const x = globalThis[unknownKey];",
    "const x = globalThis?.[unknownKey];",
    'const x = globalThis[`doc${"ument"}`];',
  ])
    browserBlocked(source);
});

test("known non-browser globalThis literal remains allowed", () => {
  assert.equal(fixture('const x = globalThis["Math"];').result, 1);
});

test("ordinary object property names and strings are not browser globals", () => {
  assert.equal(
    fixture(
      'const cfg = { window: 1, document: "mock" }; const x = cfg.window;',
    ).result,
    1,
  );
  assert.equal(
    fixture('const text = "globalThis.window"; // globalThis["document"]')
      .result,
    1,
  );
});

test("globalThis aliases and destructuring cannot bypass browser-only checks", () => {
  for (const source of [
    "const alias = globalThis; alias.window;",
    "const { window: browser } = globalThis; browser.location;",
    'Reflect.get(globalThis, "document");',
    "const getter = () => globalThis;",
  ]) {
    assert.match(
      String(fixture(source).error),
      /Mini globalThis alias forbidden: core\/example\.ts/,
    );
  }
});

test("direct statically checked safe global access and DTO keys remain allowed", () => {
  for (const source of [
    "const n = globalThis.Math.max(1, 2);",
    'const n = globalThis["Math"].max(1, 2);',
    'const data = { globalThis: "metadata" };',
    "const { globalThis: value } = input;",
  ]) {
    assert.equal(fixture(source).result, 1);
  }
});

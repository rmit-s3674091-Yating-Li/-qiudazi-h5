import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const temp = await mkdtemp(join(tmpdir(), "qiudazi-v8-photo-preview-ui-"));
try {
  const source = await readFile("src/domain/PlatformAdminPhotoPreview.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: "PlatformAdminPhotoPreview.ts",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const modulePath = join(temp, "PlatformAdminPhotoPreview.mjs");
  await writeFile(modulePath, compiled.outputText, "utf8");
  const { parseAdminPhotoPreview: parse, validAdminPhotoId: validId } =
    await import(pathToFileURL(modulePath).href);
  const origin = "https://example.supabase.co";
  const signed = `${origin}/storage/v1/object/sign/event-photos/event-1/watermarked.jpg?token=abc123`;
  assert.deepEqual(parse({ url: signed, expires_in: 60 }, origin), { url: signed, expiresIn: 60 });
  assert.equal(validId("a1111111-1111-4111-8111-111111111111"), true);
  assert.equal(validId("bad-id"), false);
  for (const invalid of [null, {}, [], { url: signed },
    { url: signed, expires_in: 61 }, { url: signed, expires_in: 0 },
    { url: signed, expires_in: "60" }, { url: signed, expires_in: 1.5 },
    { url: signed, expires_in: 60, path: "secret" },
    { url: signed.replace(origin, "https://evil.example"), expires_in: 60 },
    { url: signed.replace("https:", "http:"), expires_in: 60 },
    { url: `${origin}/storage/v1/object/sign/personal-album/x?token=x`, expires_in: 60 },
    { url: `${origin}/storage/v1/object/public/event-photos/x?token=x`, expires_in: 60 },
    { url: `${origin}/storage/v1/object/sign/event-photos/x`, expires_in: 60 },
    { url: `${signed}&token=other`, expires_in: 60 },
    { url: `${signed}&download=true`, expires_in: 60 },
    { url: `${signed}#fragment`, expires_in: 60 },
    { url: `${origin}/storage/v1/object/sign/event-photos/%2e%2e/secret?token=x`, expires_in: 60 },
  ]) assert.equal(parse(invalid, origin), null, "invalid/overshared preview response must fail closed");

  const ui = await readFile("src/components/PlatformAdminPhotoPreview.tsx", "utf8");
  const transpiled = ts.transpileModule(ui, {
    fileName: "PlatformAdminPhotoPreview.tsx",
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0);
  assert.match(ui, /functions\.invoke\("platform-admin-photo-preview"/, "only trusted Edge route");
  assert.match(ui, /body: \{ event_id: eventId, photo_id: photoId \}/, "scope IDs only");
  assert.match(ui, /parseAdminPhotoPreview\(data, supabase\.supabaseUrl\)/, "strict origin-bound parser");
  assert.match(ui, /generation\.current !== epoch/, "ignore stale requests");
  assert.match(ui, /loadedScope !== scope/, "do not render old account or photo");
  assert.match(ui, /\[userId, eventId, photoId\]/, "reset when scope changes");
  assert.match(ui, /visibilitychange/, "hide preview when backgrounded");
  assert.match(ui, /expiresIn - 5/, "clear signed URL before expiry");
  assert.match(ui, /referrerPolicy="no-referrer"/, "avoid bearer URL referrer leakage");
  assert.doesNotMatch(ui, /\.storage\.|\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(/,
    "no browser Storage signing, direct DB access or mutation");
  assert.doesNotMatch(ui, /original_url|watermarked_path|actor_auth_user_id|role:/,
    "no private storage keys or client-selected actor/role");
  console.log("V8 Platform Admin short-lived photo preview UI contract passed");
} finally {
  await rm(temp, { recursive: true, force: true });
}

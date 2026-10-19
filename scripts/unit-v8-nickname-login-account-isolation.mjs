import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const source = await readFile("src/domain/NicknameLoginAttempt.ts", "utf8");
const compiled = ts.transpileModule(source, {
  fileName: "NicknameLoginAttempt.ts",
  reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const dir = await mkdtemp(join(tmpdir(), "qiudazi-v8-nickname-guard-"));
try {
  const path = join(dir, "NicknameLoginAttempt.mjs");
  await writeFile(path, compiled.outputText, "utf8");
  const { isCurrentNicknameLoginResponse: current } = await import(pathToFileURL(path).href);
  assert.equal(current(1, 1, 2, 2, "actor-A"), true, "exchange may continue without actor switch");
  assert.equal(current(1, 1, 2, 3, "actor-B"), false, "late exchange may not start OTP after B signs in");
  assert.equal(current(1, 2, 2, 2, "actor-A"), false, "older login cannot overwrite a newer login");
  assert.equal(current(1, 1, 2, 2, "actor-A", "actor-B"), true, "verifyOtp may resolve before auth callback");
  assert.equal(current(1, 1, 2, 3, "actor-B", "actor-B"), true, "own verifyOtp SIGNED_IN event is valid");
  assert.equal(current(1, 1, 2, 3, "actor-C", "actor-B"), false, "other actor event invalidates verified response");
  assert.equal(current(1, 1, 2, 4, "actor-B", "actor-B"), false, "A-B-A cannot revive stale login");
  assert.equal(current(1, 2, 2, 3, "actor-B", "actor-B"), false, "newer attempt supersedes late verification");

  const auth = await readFile("src/hooks/Auth.tsx", "utf8");
  const login = auth.slice(auth.indexOf("  async function loginByNickname"), auth.indexOf("  return <AuthContext.Provider"));
  assert.match(login, /const attempt=\+\+nicknameLoginAttempt\.current/);
  assert.match(login, /isCurrentNicknameLoginResponse\(attempt,nicknameLoginAttempt\.current,startedGeneration,identity\.current\.version,identity\.current\.userId\)/);
  assert.match(login, /isCurrentNicknameLoginResponse\(attempt,nicknameLoginAttempt\.current,startedGeneration,identity\.current\.version,identity\.current\.userId,verified\.data\.session\.user\.id\)/);
  assert.match(login, /identity\.current\.isCurrent\(adoptedUserId,adoptedGeneration\)/);
  assert.match(login, /if\(mayCleanUp\)\{setSession\(null\)/, "stale failures must not sign out the new actor");
  assert.match(login, /if\(nicknameLoginAttempt\.current===attempt\)setBusy\(false\)/);
  assert.match(login, /if\(e!==supersededError&&mayCleanUp\)/, "stale failure cannot paint new actor's error");
  // Execute the actual Auth.tsx function with deferred service responses; source
  // checks alone would miss a stale catch() clearing the new actor's profile.
  const sourceFunction = login;
  const wrapper = ts.transpileModule(`function createLogin(deps) {
    const { supabase, nicknameLoginAttempt, identity, observeSession, repository,
      setBusy, setError, setSession, setProfile, clearQueryCache,
      clearIdentityClientStorage, writeCachedProfile, clearCachedProfile,
      clearLoginRequired, markLoginRequired, setLoginRequired, localStorage,
      explainError, isEnglish, isCurrentNicknameLoginResponse } = deps;
    ${sourceFunction}
    return loginByNickname;
  }`, { fileName: "nickname-login-harness.ts", reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } });
  assert.equal(wrapper.diagnostics?.length ?? 0, 0);
  const createLogin = new Function(`${wrapper.outputText}; return createLogin;`)();
  const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  };
  function harness(exchange, verified, profile) {
    const changes = [];
    const actor = { userId: "actor-A", version: 1,
      isCurrent(id, generation) { return this.userId === id && this.version === generation; },
      observe(id) { if (this.userId !== id) { this.userId = id; this.version++; } return this.version; } };
    const deps = {
      supabase: { functions: { invoke: () => exchange.promise }, auth: { verifyOtp: () => verified.promise } },
      nicknameLoginAttempt: { current: 0 }, identity: { current: actor },
      observeSession: (session) => { const generation = actor.observe(session.user.id); changes.push(`session:${session.user.id}`); return generation; },
      repository: { profile: () => profile.promise },
      setBusy: (v) => changes.push(`busy:${v}`), setError: (v) => changes.push(`error:${v}`),
      setSession: (v) => changes.push(`setSession:${v?.user?.id ?? "null"}`),
      setProfile: (v) => changes.push(`profile:${v?.id ?? "null"}`),
      clearQueryCache: () => {}, clearIdentityClientStorage: () => {},
      writeCachedProfile: (id) => changes.push(`cache:${id}`), clearCachedProfile: () => changes.push("clearProfile"),
      clearLoginRequired: () => {}, markLoginRequired: () => changes.push("loginRequired"),
      setLoginRequired: () => {}, localStorage: {}, explainError: (e) => String(e),
      isEnglish: () => true, isCurrentNicknameLoginResponse: current,
    };
    return { login: createLogin(deps), actor, changes };
  }
  const exchangeA = deferred(), verifiedA = deferred(), profileA = deferred();
  const firstLogin = harness(exchangeA, verifiedA, profileA);
  const staleExchange = firstLogin.login("actor-A");
  firstLogin.actor.observe("actor-B");
  exchangeA.resolve({ error: null, data: { token_hash: "a", otp_type: "email" } });
  await assert.rejects(staleExchange, /superseded/i);
  assert.equal(firstLogin.changes.some((v) => v === "setSession:null" || v === "clearProfile"), false,
    "a stale exchange failure cannot clear actor B");

  const exchangeB = deferred(), verifiedB = deferred(), profileB = deferred();
  const secondLogin = harness(exchangeB, verifiedB, profileB);
  const staleProfile = secondLogin.login("actor-B");
  exchangeB.resolve({ error: null, data: { token_hash: "b", otp_type: "email" } });
  await new Promise((resolve) => setImmediate(resolve));
  secondLogin.actor.observe("actor-B"); // Supabase SIGNED_IN emitted by verifyOtp.
  verifiedB.resolve({ error: null, data: { session: { user: { id: "actor-B" } } } });
  await new Promise((resolve) => setImmediate(resolve));
  secondLogin.actor.observe("actor-C"); // Account changed during repository.profile().
  profileB.resolve({ id: "profile-B" });
  await assert.rejects(staleProfile, /superseded/i);
  assert.equal(secondLogin.changes.some((v) => v === "profile:profile-B" || v === "cache:actor-B" || v === "setSession:null"), false,
    "a late profile cannot overwrite or sign out actor C");

  const exchangeC = deferred(), verifiedC = deferred(), profileC = deferred();
  const success = harness(exchangeC, verifiedC, profileC);
  const accepted = success.login("actor-B");
  exchangeC.resolve({ error: null, data: { token_hash: "c", otp_type: "email" } });
  await new Promise((resolve) => setImmediate(resolve));
  success.actor.observe("actor-B");
  verifiedC.resolve({ error: null, data: { session: { user: { id: "actor-B" } } } });
  await new Promise((resolve) => setImmediate(resolve));
  profileC.resolve({ id: "profile-B" });
  assert.deepEqual(await accepted, { id: "profile-B" });
  assert.ok(success.changes.includes("profile:profile-B"), "a valid login still commits its profile");
  assert.ok(success.changes.includes("cache:actor-B"), "a valid login still writes actor-scoped cache");

  console.log("PASS: V8 nickname-login actor generation, late success and failure isolation");
} finally {
  await rm(dir, { recursive: true, force: true });
}

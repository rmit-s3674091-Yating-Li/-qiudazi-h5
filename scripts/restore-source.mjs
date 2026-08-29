import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { gunzipSync } from "node:zlib";

const parts = [];
for (let i = 0; i < 9; i++) parts.push((await readFile(new URL(`../bundle/chunk${String(i).padStart(2, "0")}.txt`, import.meta.url), "utf8")).trim());
const files = JSON.parse(gunzipSync(Buffer.from(parts.join(""), "base64")).toString("utf8"));
for (const [path, payload] of Object.entries(files)) {
  await mkdir(dirname(path), { recursive: true });
  if (payload.text !== undefined) await writeFile(path, payload.text, "utf8");
  else await writeFile(path, Buffer.from(payload.b64, "base64"));
}

const supabasePath = "src/repositories/supabase.ts";
const source = await readFile(supabasePath, "utf8");
const replacement = `const url =\n  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??\n  "https://rtmjzmgrhifjzxaliltm.supabase.co";\nconst key =\n  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??\n  "sb_publishable_vM47k7tVER77x3bpGSkDdw_dowVImzn";`;
const patched = source.replace(/const url = import\.meta\.env\.VITE_SUPABASE_URL as string \| undefined;\nconst key = import\.meta\.env\.VITE_SUPABASE_ANON_KEY as string \| undefined;/, replacement);
if (patched !== source) await writeFile(supabasePath, patched, "utf8");

// Guest UX: credentials are provisioned server-side by guest-session using the
// service role, with email already confirmed. No anonymous provider, email send,
// signup endpoint, SMTP, or email rate-limit dependency is involved.
const authPath = "src/hooks/Auth.tsx";
const authSource = await readFile(authPath, "utf8");
const anonymousBlock = `      if (!s) {\n        const result = await supabase.auth.signInAnonymously();\n        if (result.error) throw result.error;\n        s = result.data.session;\n      }`;
const guestBlock = `      if (!s) {\n        const storageKey = "qiudazi_guest_credentials_v3";\n        let credentials: { email: string; password: string } | null = null;\n        try {\n          const raw = localStorage.getItem(storageKey);\n          if (raw) {\n            const saved = JSON.parse(raw) as { email?: unknown; password?: unknown };\n            if (typeof saved.email === "string" && typeof saved.password === "string") credentials = { email: saved.email, password: saved.password };\n          }\n        } catch {}\n\n        if (credentials) {\n          const signInResult = await supabase.auth.signInWithPassword(credentials);\n          if (!signInResult.error) s = signInResult.data.session;\n          else { localStorage.removeItem(storageKey); credentials = null; }\n        }\n\n        if (!s) {\n          const provision = await supabase.functions.invoke("guest-session", { body: {} });\n          if (provision.error) throw provision.error;\n          const data = provision.data as { email?: unknown; password?: unknown; error?: unknown } | null;\n          if (!data || typeof data.email !== "string" || typeof data.password !== "string") throw new Error(typeof data?.error === "string" ? data.error : "游客身份创建失败");\n          credentials = { email: data.email, password: data.password };\n          localStorage.setItem(storageKey, JSON.stringify(credentials));\n          const signInResult = await supabase.auth.signInWithPassword(credentials);\n          if (signInResult.error) throw signInResult.error;\n          s = signInResult.data.session;\n        }\n        if (!s) throw new Error("游客身份创建失败，请刷新页面重试");\n      }`;
const authPatched = authSource.replace(anonymousBlock, guestBlock);
if (authPatched === authSource) throw new Error("Failed to patch guest authentication flow");
await writeFile(authPath, authPatched, "utf8");

// CloudBase static hosting does not provide an SPA history fallback by default.
// HashRouter keeps client-side routes after # so refresh/deep links always request
// the real index document instead of paths like /profile from object storage.
const routerCandidates = ["src/main.tsx", "src/App.tsx"];
let routerPatched = false;
for (const routerPath of routerCandidates) {
  try {
    const routerSource = await readFile(routerPath, "utf8");
    if (routerSource.includes("BrowserRouter")) {
      const next = routerSource.replaceAll("BrowserRouter", "HashRouter");
      await writeFile(routerPath, next, "utf8");
      routerPatched = true;
    }
  } catch {}
}
if (!routerPatched) throw new Error("Failed to patch BrowserRouter to HashRouter");

console.log(`Restored ${Object.keys(files).length} deployment source files.`);

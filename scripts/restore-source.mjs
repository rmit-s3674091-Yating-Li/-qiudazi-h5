import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { gunzipSync } from "node:zlib";

const parts = [];
for (let i = 0; i < 9; i++) {
  parts.push(
    (
      await readFile(
        new URL(`../bundle/chunk${String(i).padStart(2, "0")}.txt`, import.meta.url),
        "utf8",
      )
    ).trim(),
  );
}

const packed = parts.join("");
const files = JSON.parse(
  gunzipSync(Buffer.from(packed, "base64")).toString("utf8"),
);

for (const [path, payload] of Object.entries(files)) {
  await mkdir(dirname(path), { recursive: true });
  if (payload.text !== undefined) {
    await writeFile(path, payload.text, "utf8");
  } else {
    await writeFile(path, Buffer.from(payload.b64, "base64"));
  }
}

// Production Supabase client configuration fallback.
const supabasePath = "src/repositories/supabase.ts";
const source = await readFile(supabasePath, "utf8");
const replacement = `const url =\n  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??\n  "https://rtmjzmgrhifjzxaliltm.supabase.co";\nconst key =\n  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??\n  "sb_publishable_vM47k7tVER77x3bpGSkDdw_dowVImzn";`;
const patched = source.replace(
  /const url = import\.meta\.env\.VITE_SUPABASE_URL as string \| undefined;\nconst key = import\.meta\.env\.VITE_SUPABASE_ANON_KEY as string \| undefined;/,
  replacement,
);
if (patched !== source) {
  await writeFile(supabasePath, patched, "utf8");
}

// Do not depend on Supabase Anonymous Sign-Ins. For the H5 MVP we create a
// hidden email/password account per browser and persist those credentials only
// in that browser. The user still experiences a nickname-only guest flow, while
// existing authenticated RLS/RPC/Edge Function authorization keeps working.
const authPath = "src/hooks/Auth.tsx";
const authSource = await readFile(authPath, "utf8");
const anonymousBlock = `      if (!s) {\n        const result = await supabase.auth.signInAnonymously();\n        if (result.error) throw result.error;\n        s = result.data.session;\n      }`;
const guestBlock = `      if (!s) {\n        const storageKey = "qiudazi_guest_credentials_v1";\n        let credentials: { email: string; password: string } | null = null;\n        try {\n          const raw = localStorage.getItem(storageKey);\n          if (raw) {\n            const saved = JSON.parse(raw) as { email?: unknown; password?: unknown };\n            if (typeof saved.email === "string" && typeof saved.password === "string") {\n              credentials = { email: saved.email, password: saved.password };\n            }\n          }\n        } catch {}\n        if (!credentials) {\n          const id = crypto.randomUUID().replace(/-/g, "");\n          credentials = {\n            email: \`guest-\${id}@guest.qiudazi.app\`,\n            password: \`Qd!\${crypto.randomUUID()}\${crypto.randomUUID()}\`,\n          };\n          localStorage.setItem(storageKey, JSON.stringify(credentials));\n        }\n\n        let result = await supabase.auth.signInWithPassword(credentials);\n        if (result.error) {\n          result = await supabase.auth.signUp(credentials);\n        }\n        if (result.error) throw result.error;\n        s = result.data.session;\n        if (!s) {\n          throw new Error("游客身份创建失败，请刷新页面重试");\n        }\n      }`;
const authPatched = authSource.replace(anonymousBlock, guestBlock);
if (authPatched === authSource) {
  throw new Error("Failed to patch guest authentication flow");
}
await writeFile(authPath, authPatched, "utf8");

console.log(`Restored ${Object.keys(files).length} deployment source files.`);

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

// The Vercel project intentionally does not store .env.production in GitHub.
// Use the configured Supabase project as a safe client-side fallback so the
// public deployment works even when Vercel environment variables are absent.
const supabaseRepository = `import { createClient } from "@supabase/supabase-js";
import type {
  Event,
  EventConfig,
  Player,
  Profile,
  Snapshot,
} from "../domain/types";
import type { Filters, TournamentRepository } from "./contracts";
const url =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  "https://rtmjzmgrhifjzxaliltm.supabase.co";
const key =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  "sb_publishable_vM47k7tVER77x3bpGSkDdw_dowVImzn";
export const configured = !!(url && key);
export const supabase = configured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
function client() {
  if (!supabase)
    throw new Error(
      "请先配置Supabase项目。当前不会使用本地数据替代在线数据库。",
    );
  return supabase;
}
`;

const existing = await readFile("src/repositories/supabase.ts", "utf8");
const marker = "const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;";
if (existing.includes(marker)) {
  const rest = existing.slice(existing.indexOf("function client()"));
  const clientEnd = rest.indexOf("\n}\n") + 3;
  await writeFile(
    "src/repositories/supabase.ts",
    supabaseRepository + rest.slice(0, clientEnd) + rest.slice(clientEnd),
    "utf8",
  );
}

console.log(`Restored ${Object.keys(files).length} deployment source files.`);
`;

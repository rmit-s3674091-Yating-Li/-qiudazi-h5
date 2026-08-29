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

const supabasePath = "src/repositories/supabase.ts";
const source = await readFile(supabasePath, "utf8");
const marker = "const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;";
const replacement = `const url =\n  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??\n  "https://rtmjzmgrhifjzxaliltm.supabase.co";\nconst key =\n  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??\n  "sb_publishable_vM47k7tVER77x3bpGSkDdw_dowVImzn";`;
const patched = source.replace(
  /const url = import\.meta\.env\.VITE_SUPABASE_URL as string \| undefined;\nconst key = import\.meta\.env\.VITE_SUPABASE_ANON_KEY as string \| undefined;/,
  replacement,
);
if (patched !== source) {
  await writeFile(supabasePath, patched, "utf8");
}

console.log(`Restored ${Object.keys(files).length} deployment source files.`);

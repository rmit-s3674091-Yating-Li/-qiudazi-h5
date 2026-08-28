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

console.log(`Restored ${Object.keys(files).length} deployment source files.`);

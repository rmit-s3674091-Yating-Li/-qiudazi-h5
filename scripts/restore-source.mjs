import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { gunzipSync } from "node:zlib";

const packed = (await readFile(new URL("../source.bundle.b64", import.meta.url), "utf8")).trim();
const files = JSON.parse(gunzipSync(Buffer.from(packed, "base64")).toString("utf8"));
for (const [path, payload] of Object.entries(files)) {
  await mkdir(dirname(path), { recursive: true });
  if (payload.text !== undefined) await writeFile(path, payload.text, "utf8");
  else await writeFile(path, Buffer.from(payload.b64, "base64"));
}
console.log(`Restored ${Object.keys(files).length} deployment source files.`);

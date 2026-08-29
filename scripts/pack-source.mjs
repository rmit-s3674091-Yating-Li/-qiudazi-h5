import { readFile, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";

const partCount = 9;
const encodedParts = [];
for (let i = 0; i < partCount; i++) {
  encodedParts.push(
    (
      await readFile(
        new URL(
          `../bundle/chunk${String(i).padStart(2, "0")}.txt`,
          import.meta.url,
        ),
        "utf8",
      )
    ).trim(),
  );
}

const previousFiles = JSON.parse(
  gunzipSync(Buffer.from(encodedParts.join(""), "base64")).toString("utf8"),
);
const files = {};
for (const [path, previousPayload] of Object.entries(previousFiles)) {
  const content = await readFile(new URL(`../${path}`, import.meta.url));
  files[path] =
    previousPayload.text !== undefined
      ? { text: content.toString("utf8") }
      : { b64: content.toString("base64") };
}

const encoded = gzipSync(Buffer.from(JSON.stringify(files))).toString("base64");
const partLength = Math.ceil(encoded.length / partCount);
for (let i = 0; i < partCount; i++) {
  await writeFile(
    new URL(
      `../bundle/chunk${String(i).padStart(2, "0")}.txt`,
      import.meta.url,
    ),
    encoded.slice(i * partLength, (i + 1) * partLength) + "\n",
    "utf8",
  );
}
await writeFile(
  new URL("../source.bundle.b64", import.meta.url),
  encoded + "\n",
  "utf8",
);

console.log(`Packed ${Object.keys(files).length} deployment source files.`);

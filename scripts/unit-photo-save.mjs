import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root=new URL("../",import.meta.url),tmp=await mkdtemp(join(tmpdir(),"qiudazi-photo-save-unit-"));
try{
  const source=await readFile(new URL("src/utils/photoSave.ts",root),"utf8");
  const result=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022},fileName:"photoSave.ts"});
  await writeFile(join(tmp,"photoSave.js"),result.outputText,"utf8");
  const photo=await import(pathToFileURL(join(tmp,"photoSave.js")).href+`?v=${Date.now()}`);

  assert.equal(photo.choosePhotoSaveMode(true,true),"share","file-capable native share is preferred for mobile save UX");
  assert.equal(photo.choosePhotoSaveMode(false,true),"download","ordinary browsers fall back to an explicit download");
  assert.equal(photo.choosePhotoSaveMode(false,false),"open","restricted WebViews fall back to opening the short-lived signed photo");

  assert.equal(photo.safePhotoFilename("  周六/单打:决赛  "),"周六-单打-决赛.jpg");
  assert.equal(photo.safePhotoFilename("event-photo.jpeg"),"event-photo.jpeg");
  assert.equal(photo.safePhotoFilename("<>|"),"---.jpg");
  assert.equal(photo.safePhotoFilename("   "),"qiudazi-photo.jpg");
  assert.ok(!photo.safePhotoFilename("../../secret").includes("/"),"generated filename cannot contain path separators");

  console.log("✓ photo save mode fallback and safe local filename contract");
}finally{await rm(tmp,{recursive:true,force:true})}

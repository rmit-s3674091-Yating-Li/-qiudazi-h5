import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
const root=new URL("../",import.meta.url),tmp=await mkdtemp(join(tmpdir(),"qiudazi-identity-unit-"));
try{
  const source=await readFile(new URL("src/domain/IdentitySession.ts",root),"utf8");
  const result=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022},fileName:"IdentitySession.ts"});
  await writeFile(join(tmp,"IdentitySession.js"),result.outputText,"utf8");
  const identity=await import(pathToFileURL(join(tmp,"IdentitySession.js")).href+`?v=${Date.now()}`);
  class MemoryStorage{constructor(entries){this.map=new Map(entries)}get length(){return this.map.size}key(i){return [...this.map.keys()][i]??null}getItem(k){return this.map.get(k)??null}setItem(k,v){this.map.set(k,String(v))}removeItem(k){this.map.delete(k)}}
  const storage=new MemoryStorage([[identity.PROFILE_CACHE_KEY,"profile"],[identity.GUEST_CREDENTIALS_KEY,"secret"],["qiudazi_pending_score","pending"],["qiudazi-language","en"],["unrelated","keep"]]);
  identity.clearIdentityClientStorage(storage);
  assert.equal(storage.getItem(identity.PROFILE_CACHE_KEY),null);assert.equal(storage.getItem(identity.GUEST_CREDENTIALS_KEY),null);assert.equal(storage.getItem("qiudazi_pending_score"),null);assert.equal(storage.getItem("qiudazi-language"),"en");assert.equal(storage.getItem("unrelated"),"keep");
  identity.markLoginRequired(storage);assert.equal(identity.isLoginRequired(storage),true);identity.clearLoginRequired(storage);assert.equal(identity.isLoginRequired(storage),false);
  console.log("✓ identity sign-out storage isolation and explicit-login boundary");
}finally{await rm(tmp,{recursive:true,force:true})}

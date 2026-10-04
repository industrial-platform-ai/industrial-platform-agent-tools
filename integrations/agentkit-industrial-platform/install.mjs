#!/usr/bin/env node
/**
 * Industrial Platform -> Coinbase AgentKit bootstrap installer.
 *
 * Run from the root of an existing TypeScript AgentKit project:
 *   curl -fsSL https://raw.githubusercontent.com/industrial-platform-ai/industrial-platform-agent-tools/main/integrations/agentkit-industrial-platform/install.mjs | node
 *
 * The installer refuses ambiguous projects instead of guessing.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT=process.cwd();
const RAW_BASE=process.env.INDUSTRIAL_PLATFORM_AGENTKIT_SOURCE_BASE || "https://raw.githubusercontent.com/industrial-platform-ai/industrial-platform-agent-tools/main/integrations/agentkit-industrial-platform";
const SKIP_NPM_INSTALL=process.env.INDUSTRIAL_PLATFORM_SKIP_NPM_INSTALL==="1";
const VENDOR_REL="vendor/industrial-platform-agentkit";
const VENDOR=path.join(ROOT,VENDOR_REL);
const PROVIDER_IMPORT='import { industrialPlatformActionProvider } from "@industrial-platform/agentkit";';

function fail(message){ console.error("Industrial Platform AgentKit installer:",message); process.exit(1); }
function readJson(file){ return JSON.parse(fs.readFileSync(file,"utf8")); }
function writeJson(file,value){ fs.writeFileSync(file,JSON.stringify(value,null,2)+"\n"); }
function backup(file){
  if(!fs.existsSync(file)) return;
  const dest=file+".before-industrial-platform";
  if(!fs.existsSync(dest)) fs.copyFileSync(file,dest);
}
async function fetchText(url){
  const response=await fetch(url,{headers:{"user-agent":"industrial-platform-agentkit-installer/0.1"}});
  if(!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return await response.text();
}
function walk(dir,out=[]){
  if(!fs.existsSync(dir)) return out;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(["node_modules",".git","dist","build","vendor"].includes(entry.name)) continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) walk(full,out);
    else if(/\.(ts|tsx|mts|cts)$/.test(entry.name)) out.push(full);
  }
  return out;
}
function relImport(fromFile,toFileNoExt){
  let rel=path.relative(path.dirname(fromFile),toFileNoExt).replaceAll(path.sep,"/");
  if(!rel.startsWith(".")) rel="./"+rel;
  return rel+".js";
}

const packageFile=path.join(ROOT,"package.json");
if(!fs.existsSync(packageFile)) fail("Run this command from the root of an existing AgentKit project (package.json not found).");
const pkg=readJson(packageFile);
const agentkitVersion=pkg.dependencies?.["@coinbase/agentkit"] ?? pkg.devDependencies?.["@coinbase/agentkit"];
if(!agentkitVersion) fail("package.json does not depend on @coinbase/agentkit.");

const candidates=[...new Set([
  ...walk(path.join(ROOT,"src")),
  ...walk(path.join(ROOT,"app")),
  ...walk(path.join(ROOT,"lib")),
  ...walk(ROOT).filter(f=>path.dirname(f)===ROOT)
])].filter(file=>{
  const text=fs.readFileSync(file,"utf8");
  return text.includes("AgentKit.from(") && /actionProviders\s*:\s*\[/.test(text);
});

if(candidates.length!==1){
  fail(`Expected exactly one AgentKit.from(...) file with actionProviders: [...]; found ${candidates.length}. Refusing to guess. Candidates: ${candidates.map(f=>path.relative(ROOT,f)).join(", ")||"(none)"}`);
}
const entryFile=candidates[0];

fs.mkdirSync(path.join(VENDOR,"src"),{recursive:true});
for(const rel of ["package.json","tsconfig.json","src/index.ts"]){
  const body=await fetchText(`${RAW_BASE}/${rel}`);
  const dest=path.join(VENDOR,rel);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,body);
}

backup(packageFile);
pkg.dependencies ||= {};
pkg.dependencies["@industrial-platform/agentkit"]="file:vendor/industrial-platform-agentkit";
writeJson(packageFile,pkg);

const tsconfigFile=path.join(ROOT,"tsconfig.json");
if(fs.existsSync(tsconfigFile)){
  backup(tsconfigFile);
  const ts=readJson(tsconfigFile);
  ts.compilerOptions ||= {};
  ts.compilerOptions.experimentalDecorators=true;
  ts.compilerOptions.emitDecoratorMetadata=true;
  writeJson(tsconfigFile,ts);
}

backup(entryFile);
let source=fs.readFileSync(entryFile,"utf8");
if(!source.includes(PROVIDER_IMPORT)){
  const importMatches=[...source.matchAll(/^import[^;]+;\s*$/gm)];
  if(importMatches.length){
    const last=importMatches.at(-1);
    const pos=last.index+last[0].length;
    source=source.slice(0,pos)+"\n"+PROVIDER_IMPORT+source.slice(pos);
  }else{
    source=PROVIDER_IMPORT+"\n"+source;
  }
}
if(!source.includes("industrialPlatformActionProvider(")){
  const match=/actionProviders\s*:\s*\[/.exec(source);
  if(!match) fail("AgentKit actionProviders anchor disappeared while patching.");
  const pos=match.index+match[0].length;
  source=source.slice(0,pos)+
    "\n        industrialPlatformActionProvider({ maxPaymentUsdc: 0.05, rememberRecurringState: true }),"+
    source.slice(pos);
}
fs.writeFileSync(entryFile,source);

if(!SKIP_NPM_INSTALL){
  try{
    execFileSync(process.platform==="win32"?"npm.cmd":"npm",["install","--no-audit","--no-fund"],{cwd:ROOT,stdio:"inherit"});
  }catch(error){
    fail("npm install failed. Backups ending in .before-industrial-platform were retained.");
  }
}

console.log(JSON.stringify({
  ok:true,
  agentkitDependency:agentkitVersion,
  vendorPackage:VENDOR_REL,
  patched:path.relative(ROOT,entryFile),
  provider:"industrialPlatformActionProvider",
  maxPaymentUsdc:0.05,
  note:"Industrial Platform is now a native AgentKit action provider in this project. Review git diff before deployment."
},null,2));

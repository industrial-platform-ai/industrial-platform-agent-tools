"use strict";
// Safe catalog adapter: delegates to existing gateway paths; never processes payments.
// Source-controlled revisions provide durable rollback via Git history.
const BASE="https://x402-gateway-production-1f21.up.railway.app";
const PAYEE="0xF7Eb4b12D673dF433d76B2DBD9CA41Db3fE1836E";
const SERVICES=Object.freeze([
{id:"markdown",path:"/web/markdown",method:"POST",fields:["url"],priceMicrousd:1000,category:"markdown"},
{id:"change",path:"/change",method:"POST",fields:["url"],priceMicrousd:1000,category:"change"},
{id:"metadata",path:"/metadata",method:"POST",fields:["url"],priceMicrousd:1000,category:"other"},
{id:"crypto-price",path:"/crypto/price",method:"POST",fields:[],priceMicrousd:1000,category:"other"}
]);
function validateCatalog(catalog){
 if(!catalog||!Number.isSafeInteger(catalog.version)||catalog.version<1||!Array.isArray(catalog.services))throw Error("invalid catalog");
 const ids=new Set(),paths=new Set();
 for(const s of catalog.services){
  if(!s||typeof s.id!=="string"||!/^[a-z0-9-]+$/.test(s.id)||!/^\/[a-z0-9/-]+$/.test(s.path)||!["POST","GET"].includes(s.method)||!Array.isArray(s.fields)||!s.fields.every(f=>typeof f==="string"&&/^[a-zA-Z][a-zA-Z0-9]*$/.test(f))||!Number.isSafeInteger(s.priceMicrousd)||s.priceMicrousd<=0||typeof s.verified!=="boolean")throw Error("invalid service");
  if(ids.has(s.id)||paths.has(s.path))throw Error("duplicate service");
  ids.add(s.id);paths.add(s.path);
 }
 return true;
}
function defaultCatalog(){return {version:1,services:SERVICES.map(s=>({...s,verified:false}))};}
function revise(catalog,updates){
 validateCatalog(catalog);
 if(!Array.isArray(updates)||updates.length===0)throw Error("updates required");
 const next=structuredClone(catalog);
 for(const update of updates){
  const service=next.services.find(s=>s.id===update.id);
  if(!service)throw Error("unknown service");
  // Only metadata fields may change in bulk; verification must be re-earned.
  if(!["priceMicrousd","fields"].includes(update.field))throw Error("field not editable");
  service[update.field]=update.value;service.verified=false;
 }
 next.version++;validateCatalog(next);return next;
}
function manifest(catalog){
 validateCatalog(catalog);
 return {version:catalog.version,payTo:PAYEE,services:catalog.services.filter(s=>s.verified).map(s=>({id:s.id,url:BASE+s.path,method:s.method,priceMicrousd:s.priceMicrousd}))};
}
function route(catalog,id,input){
 validateCatalog(catalog);
 const s=catalog.services.find(s=>s.id===id);
 if(!s||!s.verified)throw Error("service not verified");
 if(!input||typeof input!=="object"||Array.isArray(input)||s.fields.some(f=>typeof input[f]!=="string"||!input[f].trim()))throw Error("invalid input");
 return {url:BASE+s.path,method:s.method,body:input};
}
module.exports={BASE,PAYEE,SERVICES,validateCatalog,defaultCatalog,revise,manifest,route};

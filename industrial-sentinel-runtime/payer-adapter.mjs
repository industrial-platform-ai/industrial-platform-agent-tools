import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { x402Client, x402HTTPClient, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

const PORT=Number(process.env.SENTINEL_PAYER_PORT||8403);
const ORIGIN='https://x402-gateway-production-1f21.up.railway.app';
const key=String(process.env.SENTINEL_EVM_PRIVATE_KEY||'').trim();
const dailyCap=Math.max(0,Number(process.env.SENTINEL_MAX_DAILY_USD||5));
const statePath=process.env.SENTINEL_SPEND_STATE||'/home/node/.openclaw/industrial-sentinel-spend.json';

const PRICE_BY_PATH=new Map([
  ['/agent/wallet-monitor',0.005],
  ['/agent/transaction-watch',0.003],
  ['/agent/treasury-snapshot',0.01],
  ['/agent/pretrade',0.01],
  ['/crypto/snapshot',0.008],
  ['/change',0.001],
  ['/x402/adoption-search',0.001],
]);

function dayKey(){ return new Date().toISOString().slice(0,10); }
function loadState(){
  try{
    const parsed=JSON.parse(fs.readFileSync(statePath,'utf8'));
    if(parsed?.day===dayKey() && Number.isFinite(parsed?.spentUsd)) return parsed;
  }catch{}
  return {day:dayKey(),spentUsd:0};
}
function saveState(s){
  fs.mkdirSync(path.dirname(statePath),{recursive:true});
  const tmp=statePath+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(s),{mode:0o600});
  fs.renameSync(tmp,statePath);
}
function currentState(){
  const s=loadState();
  if(s.day!==dayKey()) return {day:dayKey(),spentUsd:0};
  return s;
}
function json(res,status,obj){
  const body=JSON.stringify(obj);
  res.writeHead(status,{'content-type':'application/json','content-length':Buffer.byteLength(body)});
  res.end(body);
}

let paidFetch=null;
if(/^0x[0-9a-fA-F]{64}$/.test(key)){
  const signer=privateKeyToAccount(key);
  const client=new x402Client();
  registerExactEvmScheme(client,{signer});
  paidFetch=wrapFetchWithPayment(globalThis.fetch,new x402HTTPClient(client));
}

async function handlePaid(req,res){
  if(!paidFetch) return json(res,503,{ok:false,error:'payer_not_configured'});
  let raw='';
  for await(const chunk of req){
    raw+=chunk;
    if(raw.length>250000) return json(res,413,{ok:false,error:'request_too_large'});
  }
  let input;
  try{ input=JSON.parse(raw||'{}'); }catch{ return json(res,400,{ok:false,error:'invalid_json'}); }

  let target;
  try{ target=new URL(String(input.target||'')); }catch{ return json(res,400,{ok:false,error:'invalid_target'}); }
  if(target.origin!==ORIGIN) return json(res,403,{ok:false,error:'target_origin_not_allowed'});
  const price=PRICE_BY_PATH.get(target.pathname);
  if(price===undefined) return json(res,403,{ok:false,error:'target_path_not_allowed'});
  const callerMax=Number(input.maxUsd);
  if(!Number.isFinite(callerMax)||callerMax<price) return json(res,400,{ok:false,error:'maxUsd_below_route_price',routePriceUsd:price});
  if(callerMax>price) return json(res,400,{ok:false,error:'maxUsd_must_equal_route_price',routePriceUsd:price});

  const spend=currentState();
  if(spend.spentUsd+price>dailyCap+1e-12){
    return json(res,429,{ok:false,error:'daily_spend_cap_reached',spentUsd:spend.spentUsd,maxDailyUsd:dailyCap});
  }

  const method=String(input.method||'POST').toUpperCase();
  if(method!=='POST') return json(res,405,{ok:false,error:'method_not_allowed'});
  const requestInit={
    method:'POST',
    headers:{'content-type':'application/json','user-agent':'Industrial-Sentinel-Runtime/0.1'},
    body:JSON.stringify(input.body||{})
  };

  // Probe first: only authorize payment if the production route actually challenges.
  const probe=await fetch(target.toString(),requestInit);
  if(probe.status!==402){
    const text=(await probe.text()).slice(0,20000);
    return json(res,probe.ok?200:502,{ok:probe.ok,paid:false,httpStatus:probe.status,body:text});
  }

  let response;
  try{
    response=await paidFetch(target.toString(),requestInit);
  }catch(error){
    // Conservatively count the authorized attempt against the cap.
    spend.spentUsd+=price; saveState(spend);
    return json(res,502,{ok:false,error:'x402_payment_failed',message:String(error?.message||error),spentUsd:spend.spentUsd});
  }

  // A paid retry was attempted. Count it conservatively regardless of application response.
  spend.spentUsd+=price; saveState(spend);
  const text=(await response.text()).slice(0,20000);
  return json(res,response.ok?200:502,{
    ok:response.ok,
    paid:true,
    httpStatus:response.status,
    paymentResponse:response.headers.get('payment-response')||response.headers.get('x-payment-response')||null,
    body:text,
    spentUsd:spend.spentUsd,
    maxDailyUsd:dailyCap
  });
}

const server=http.createServer(async(req,res)=>{
  try{
    if(req.method==='GET'&&req.url==='/health'){
      const s=currentState();
      return json(res,200,{ok:true,payerConfigured:Boolean(paidFetch),spentUsd:s.spentUsd,maxDailyUsd:dailyCap,allowedOrigin:ORIGIN});
    }
    if(req.method==='POST'&&req.url==='/x402-fetch') return await handlePaid(req,res);
    return json(res,404,{ok:false,error:'not_found'});
  }catch(error){
    return json(res,500,{ok:false,error:'internal_error',message:String(error?.message||error)});
  }
});
server.listen(PORT,'127.0.0.1',()=>console.log(JSON.stringify({event:'sentinel_payer_ready',port:PORT,payerConfigured:Boolean(paidFetch),maxDailyUsd:dailyCap})));

import {createHash} from 'node:crypto';

const BASE_USDC='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const DEFAULT_PAYEE='0xf7eb4b12d673df433d76b2dbd9ca41db3fe1836e';
const BASE_NETWORK='eip155:8453';
const TRANSFER_TOPIC='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const bad=(message)=>Object.assign(new Error(message),{statusCode:400});
const required=(v,max=1024)=>typeof v==='string' && v.trim().length>0 && v.length<=max;
const hex=(v,len)=>typeof v==='string'&&new RegExp(`^0x[a-fA-F0-9]{${len}}$`).test(v);
const uint=(v)=>typeof v==='string'&&/^\d{1,24}$/.test(v)?BigInt(v):null;
const plain=(v)=>v&&typeof v==='object'&&!Array.isArray(v);
const sha=(v)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const normalizePayee=(v)=>String(v||'').toLowerCase();
function evaluatePayment(input){
  if(!plain(input)||!plain(input.challenge)||!Array.isArray(input.challenge.accepts)||input.challenge.accepts.length>30)throw bad('A bounded x402 challenge with accepts is required.');
  const limit=uint(input.max_atomic_usdc);
  if(limit===null)throw bad('max_atomic_usdc must be a decimal string of Base USDC atomic units.');
  const permitted=Array.isArray(input.allowed_payees)?input.allowed_payees:[];
  if(!permitted.length||permitted.length>20||!permitted.every(x=>hex(x,40)))throw bad('Explicitly approved allowed_payees are required.');
  const schemes=Array.isArray(input.supported_schemes)&&input.supported_schemes.length?input.supported_schemes:['exact'];
  const examined=input.challenge.accepts.map((a,index)=>{
    const issues=[];const amount=uint(a?.amount);
    if(a?.network!==BASE_NETWORK)issues.push('unsupported network');
    if(normalizePayee(a?.asset)!==BASE_USDC)issues.push('unsupported asset');
    if(!permitted.some(p=>normalizePayee(p)===normalizePayee(a?.payTo)))issues.push('payee not authorized');
    if(!schemes.includes(a?.scheme))issues.push('scheme not approved');
    if(amount===null)issues.push('invalid amount');
    else if(amount>limit)issues.push('exceeds authorized cap');
    return {index,scheme:a?.scheme||null,amount_atomic_usdc:amount?.toString()||null,eligible:issues.length===0,issues};
  });
  const eligible=examined.filter(x=>x.eligible).sort((a,b)=>BigInt(a.amount_atomic_usdc)<BigInt(b.amount_atomic_usdc)?-1:1);
  return {eligible:eligible.length>0,selected:eligible[0]||null,examined,network:BASE_NETWORK,diagnostic_only:true,signatures_created:0,transactions_submitted:0};
}
function compareQuotes(input){
  if(!plain(input)||!Array.isArray(input.quotes)||!input.quotes.length||input.quotes.length>25)throw bad('1 to 25 supplier quotes are required.');
  const ids=new Set(); const rows=input.quotes.map(q=>{
    if(!plain(q)||!required(q.id,80)||ids.has(q.id)||!Number.isInteger(q.price_atomic_usdc)||q.price_atomic_usdc<0||q.price_atomic_usdc>1000000000)throw bad('Each quote needs a unique supplier id and integer price_atomic_usdc.');
    ids.add(q.id);
    if(q.observed_latency_ms!==undefined&&(!Number.isFinite(q.observed_latency_ms)||q.observed_latency_ms<0))throw bad('Invalid observed latency.');
    if(q.observed_success_rate!==undefined&&(!Number.isFinite(q.observed_success_rate)||q.observed_success_rate<0||q.observed_success_rate>1))throw bad('Invalid success rate.');
    return {id:q.id,price_atomic_usdc:q.price_atomic_usdc,observed_latency_ms:q.observed_latency_ms??null,observed_success_rate:q.observed_success_rate??null,metrics_self_reported:true};
  });
  rows.sort((a,b)=>a.price_atomic_usdc-b.price_atomic_usdc||a.id.localeCompare(b.id));
  return {lowest_quoted:rows[0],ranked:rows,verified_live_availability:false,purchase_executed:false,disclosed_routing_fee_atomic_usdc:0,checked_at:new Date().toISOString()};
}
function evidence(input){
  if(!plain(input)||!required(input.source_url,2048)||!/^https:\/\//i.test(input.source_url)||!Array.isArray(input.claims)||input.claims.length<1||input.claims.length>20||!input.claims.every(v=>required(v,600)))throw bad('HTTPS source_url and 1–20 bounded claims required.');
  const payload={source_url:input.source_url,claims:input.claims,observed_at:new Date().toISOString()};
  return {payload,sha256:sha(payload),signature:null,independently_verified:false,source_fetched:false,provenance:'customer-provided',disclaimer:'Integrity fingerprint only, not a signed or independent attestation.'};
}
async function receiptProof(input,{fetcher=fetch,rpcUrl='https://base-rpc.publicnode.com',payee=DEFAULT_PAYEE}={}){
  if(!plain(input)||!hex(input.tx_hash,64))throw bad('Base transaction hash must contain 32 bytes.');
  if(!hex(payee,40))throw bad('Invalid configured payee.');
  const response=await fetcher(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getTransactionReceipt',params:[input.tx_hash]}),signal:AbortSignal.timeout(9000)});
  if(!response.ok)throw Object.assign(new Error('Base RPC unavailable'),{statusCode:502});
  const body=await response.json();if(body?.error||!Object.prototype.hasOwnProperty.call(body,'result'))throw Object.assign(new Error('Invalid Base RPC receipt response'),{statusCode:502});
  const receipt=body.result;
  if(!receipt)return {tx_hash:input.tx_hash,network:BASE_NETWORK,state:'pending_or_unknown',matching_transfers:[],x402_execution_verified:false};
  if(!hex(receipt.transactionHash,64)||receipt.transactionHash.toLowerCase()!==input.tx_hash.toLowerCase())throw Object.assign(new Error('RPC receipt mismatch'),{statusCode:502});
  const target='0x'+payee.slice(2).toLowerCase().padStart(64,'0');
  const transfers=(receipt.logs||[]).filter(log=>String(log.address||'').toLowerCase()===BASE_USDC&&String(log.topics?.[0]||'').toLowerCase()===TRANSFER_TOPIC&&String(log.topics?.[2]||'').toLowerCase()===target&&hex(log.topics?.[1],64)&&hex(log.data,64)).map(log=>({from:'0x'+log.topics[1].slice(-40).toLowerCase(),to:payee.toLowerCase(),amount_atomic_usdc:BigInt(log.data).toString(),log_index:log.logIndex||null}));
  return {tx_hash:input.tx_hash,network:BASE_NETWORK,state:receipt.status==='0x1'?'onchain_success':'onchain_revert',block_number:receipt.blockNumber||null,matching_transfers:receipt.status==='0x1'?transfers:[],total_received_atomic_usdc:receipt.status==='0x1'?transfers.reduce((n,v)=>n+BigInt(v.amount_atomic_usdc),0n).toString():'0',x402_execution_verified:false,production_intent_verified:false,source:'Base JSON-RPC eth_getTransactionReceipt',checked_at:new Date().toISOString()};
}
const addrSchema={type:'string',pattern:'^0x[a-fA-F0-9]{40}$'};
const txSchema={type:'string',pattern:'^0x[a-fA-F0-9]{64}$'};
function buildCommerceTools({networkTools=[],runChange}={}){
  const existing=(name)=>{const t=networkTools.find(x=>x.name===name);if(!t)throw Error('Missing gateway handler: '+name);return t;};
  const transaction=existing('chain-transaction-status');
  const allowance=existing('chain-erc20-allowance');
  const headers=existing('http-headers-security');
  if(typeof runChange!=='function')throw Error('Missing web change handler');
  return [
    {name:'x402-payment-diagnostic',route:'/commerce/payment-diagnostic',price:'$0.001',priceUsd:0.001,description:'Diagnose an x402 Base USDC payment challenge against an explicitly authorized payee allowlist and spending cap. Never signs or buys.',tags:['x402','payment','preflight','recovery','diagnostic'],inputSchema:{type:'object',properties:{challenge:{type:'object'},max_atomic_usdc:{type:'string'},allowed_payees:{type:'array',items:addrSchema,minItems:1,maxItems:20},supported_schemes:{type:'array',items:{type:'string'}}},required:['challenge','max_atomic_usdc','allowed_payees'],additionalProperties:false},example:{challenge:{x402Version:2,accepts:[{scheme:'exact',network:BASE_NETWORK,asset:BASE_USDC,payTo:DEFAULT_PAYEE,amount:'1000'}]},max_atomic_usdc:'1000',allowed_payees:[DEFAULT_PAYEE]},run:async input=>evaluatePayment(input)},
    {name:'agent-procurement-quote',route:'/commerce/procurement-quote',price:'$0.001',priceUsd:0.001,description:'Compare independently supplied, explicitly attributed supplier quotes by quoted cost; does not execute external purchasing or claim live supplier verification.',tags:['agent','procurement','quote','cost'],inputSchema:{type:'object',properties:{quotes:{type:'array',minItems:1,maxItems:25,items:{type:'object'}}},required:['quotes'],additionalProperties:false},example:{quotes:[{id:'vendor-a',price_atomic_usdc:1000},{id:'vendor-b',price_atomic_usdc:1500}]},run:async input=>compareQuotes(input)},
    {name:'transaction-terminal-outcome',route:'/commerce/tx-outcome',price:'$0.001',priceUsd:0.001,description:'Answer whether a Base or Ethereum transaction reached confirmed/reverted terminal state using live chain RPC.',tags:['chain','outcome','transaction','finality'],inputSchema:{type:'object',properties:{tx_hash:txSchema,network:{type:'string',enum:['base','ethereum']}},required:['tx_hash'],additionalProperties:false},example:{tx_hash:'0x'+'0'.repeat(64),network:'base'},run:async input=>{const r=await transaction.run(input);return {outcome:r.status,terminal:r.confirmed||r.reverted,confirmations:r.confirmations,network:r.network,tx_hash:r.tx_hash,checked_at:r.checked_at,next_check:r.next_check};}},
    {name:'erc20-allowance-delta',route:'/commerce/allowance-delta',price:'$0.001',priceUsd:0.001,description:'Compare current on-chain ERC-20 allowance with caller-supplied prior allowance; no transaction submitted.',tags:['chain','allowance','change','pretrade'],inputSchema:{type:'object',properties:{owner:addrSchema,spender:addrSchema,contract:addrSchema,network:{type:'string',enum:['base','ethereum']},previous_allowance_raw:{type:'string',pattern:'^\\d+$'}},required:['owner','spender','contract','previous_allowance_raw'],additionalProperties:false},example:{owner:DEFAULT_PAYEE,spender:DEFAULT_PAYEE,contract:BASE_USDC,network:'base',previous_allowance_raw:'0'},run:async input=>{const prior=uint(input.previous_allowance_raw);if(prior===null)throw bad('previous_allowance_raw must be unsigned integer text');const r=await allowance.run(input);return {changed:BigInt(r.allowance_raw)!==prior,previous_allowance_raw:prior.toString(),current_allowance_raw:r.allowance_raw,owner:r.owner,spender:r.spender,contract:r.contract,network:r.network,fetched_at:r.fetched_at};}},
    {name:'material-web-change',route:'/commerce/material-web-change',price:'$0.001',priceUsd:0.001,description:'Return a deterministic change outcome for a public URL relative to caller-supplied baseline content hash. Charged per authorized check, not only when changed.',tags:['web','change','delta','research','retention'],inputSchema:{type:'object',properties:{url:{type:'string',format:'uri'},previous_hash:{type:'string',minLength:32,maxLength:128}},required:['url','previous_hash'],additionalProperties:false},example:{url:'https://example.com/',previous_hash:'0'.repeat(64)},run:async input=>{if(!required(input.previous_hash,128))throw bad('previous hash required');const r=await runChange({url:input.url,previous_hash:input.previous_hash,include_current_text:false});return {changed:r.changed??(r.current_hash!==input.previous_hash),previous_hash:input.previous_hash,current_hash:r.current_hash,checked_at:r.checked_at,url:r.final_url||r.url,source_http_status:r.http_status,paid_per_check:true};}},
    {name:'authorized-endpoint-health',route:'/commerce/endpoint-health',price:'$0.001',priceUsd:0.001,description:'Perform one operator-authorized HEAD request to a public supplier endpoint using SSRF-safe existing gateway HTTP tooling; no paid crawler triggering.',tags:['quality','uptime','monitoring','supplier','verification'],inputSchema:{type:'object',properties:{url:{type:'string',format:'uri'},operator_authorized:{type:'boolean',const:true}},required:['url','operator_authorized'],additionalProperties:false},example:{url:'https://example.com/',operator_authorized:true},run:async input=>{if(input.operator_authorized!==true)throw bad('Operator authorization required');const r=await headers.run({url:input.url,method:'HEAD'});return {endpoint:r.final_url,status:r.status,latency_ms:r.latency_ms,reachable:r.status>=200&&r.status<500,checked_at:r.checked_at,verification_scope:'single HEAD; payment not attempted'};}},
    {name:'base-usdc-receipt-proof',route:'/commerce/usdc-receipt',price:'$0.001',priceUsd:0.001,description:'Independently inspect Base on-chain USDC Transfer logs to the Industrial Platform seller for one transaction. Does not claim x402 HTTP execution or production intent.',tags:['x402','settlement','receipt','reconciliation'],inputSchema:{type:'object',properties:{tx_hash:txSchema},required:['tx_hash'],additionalProperties:false},example:{tx_hash:'0x'+'0'.repeat(64)},run:async input=>receiptProof(input,{payee:process.env.X402_PAY_TO||DEFAULT_PAYEE})},
    {name:'agent-evidence-fingerprint',route:'/commerce/evidence-fingerprint',price:'$0.001',priceUsd:0.001,description:'Create a timestamped content fingerprint of client-provided claims and source URL with explicit unsigned/unverified provenance. No fabricated signed attestation.',tags:['evidence','audit','research','hash'],inputSchema:{type:'object',properties:{source_url:{type:'string',format:'uri'},claims:{type:'array',minItems:1,maxItems:20,items:{type:'string',maxLength:600}}},required:['source_url','claims'],additionalProperties:false},example:{source_url:'https://example.com/',claims:['The supplied source was reviewed by the caller.']},run:async input=>evidence(input)}
  ];
}
export {buildCommerceTools,evaluatePayment,compareQuotes,evidence,receiptProof};
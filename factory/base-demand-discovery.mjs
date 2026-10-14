// IPTP-compliant Base read-only demand discovery. No outreach, no deployment, no payment.
// Public RPC is rate-limited. Fixed URL, fixed RPC method allowlist and bounded calls.
import {writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export const BASE_RPC='https://mainnet.base.org';
export const CHAIN_ID='0x2105';
export const MAX_BLOCKS=8;
export const MAX_RECEIPTS=16;
export const MAX_TX_PER_BLOCK=500;
export const RPC_METHODS=Object.freeze(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getTransactionReceipt']);
const ADDRESS=/^0x[a-fA-F0-9]{40}$/;
const TX_HASH=/^0x[a-fA-F0-9]{64}$/;
const HEX_QUANTITY=/^0x[0-9a-fA-F]+$/;
const int=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const parseQty=s=>typeof s==='string'&&HEX_QUANTITY.test(s)?BigInt(s):null;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function sampleSenderActivity(blocks,{maxTxPerBlock=MAX_TX_PER_BLOCK}={}){
 if(!Array.isArray(blocks)||blocks.length>MAX_BLOCKS||!int(maxTxPerBlock,1,MAX_TX_PER_BLOCK))throw Error('Invalid sampling bounds');
 const seen=new Map(),seenTx=new Set(),counts={blocks:blocks.length,observed_transactions:0,rows_skipped:0,blocks_partially_sampled:0};
 for(const block of blocks){
  const txs=Array.isArray(block?.transactions)?block.transactions:[];
  if(txs.length>maxTxPerBlock)counts.blocks_partially_sampled++;
  for(const tx of txs.slice(0,maxTxPerBlock)){
   if(!tx||!ADDRESS.test(tx.from||'')||!TX_HASH.test(tx.hash||'')||seenTx.has(tx.hash.toLowerCase())){counts.rows_skipped++;continue}
   seenTx.add(tx.hash.toLowerCase());counts.observed_transactions++;
   const address=tx.from.toLowerCase(),item=seen.get(address)||{address,observed_transactions:0,unique_blocks:new Set(),transaction_hashes:[]};
   item.observed_transactions++;
   item.unique_blocks.add(String(block.number||'unknown'));
   if(item.transaction_hashes.length<16)item.transaction_hashes.push(tx.hash.toLowerCase());
   seen.set(address,item);
  }
 }
 const wallets=[...seen.values()].map(x=>({
  address:x.address,observed_transactions:x.observed_transactions,
  observed_blocks:x.unique_blocks.size,transaction_hashes:x.transaction_hashes
 })).sort((a,b)=>b.observed_transactions-a.observed_transactions||b.observed_blocks-a.observed_blocks||a.address.localeCompare(b.address));
 return {counts,wallets};
}

export function summarizeReceipts(wallets,receipts){
 const keyed=new Map();
 for(const entry of receipts){
  const receipt=entry?.receipt;
  if(!TX_HASH.test(entry?.transaction_hash||'')||!receipt||typeof receipt!=='object')continue;
  const hash=entry.transaction_hash.toLowerCase();
  if(!keyed.has(hash))keyed.set(hash,receipt);
 }
 return wallets.map(w=>{
  let checked=0,failed=0,failedExecutionGasWei=0n,failedL1FeeWei=0n,failedGasCostIncomplete=0;
  for(const hash of w.transaction_hashes){
   const r=keyed.get(hash);
   if(!r||!['0x0','0x1'].includes(r.status))continue;
   checked++;
   if(r.status!=='0x0')continue;
   failed++;
   const gasUsed=parseQty(r.gasUsed),effectivePrice=parseQty(r.effectiveGasPrice),l1Fee=parseQty(r.l1Fee);
   if(gasUsed===null||effectivePrice===null)failedGasCostIncomplete++;
   else failedExecutionGasWei+=gasUsed*effectivePrice;
   if(l1Fee!==null)failedL1FeeWei+=l1Fee;
  }
  return {
   address:w.address,observed_transactions:w.observed_transactions,observed_blocks:w.observed_blocks,
   sampled_receipts_checked:checked,sampled_failed_receipts:failed,
   observed_failed_execution_gas_wei:failedExecutionGasWei.toString(),
   observed_failed_l1_fee_wei:failedL1FeeWei.toString(),
   failed_fee_observation_incomplete:failedGasCostIncomplete>0,
   base_explorer:'https://base.blockscout.com/address/'+w.address,
   autonomous_agent_attribution:'unverified',
   institutional_volume_attribution:'unverified',
   mev_or_front_running_causation:'unverified',
   paid_need_or_willingness_to_buy:'unverified',
   independent_operator_identity:'unverified',
   qualifying_independent_revenue_usdc:0,
   factory_promotion_allowed:false
  };
 }).sort((a,b)=>{
  if(a.sampled_failed_receipts!==b.sampled_failed_receipts)return b.sampled_failed_receipts-a.sampled_failed_receipts;
  const aGas=BigInt(a.observed_failed_execution_gas_wei),bGas=BigInt(b.observed_failed_execution_gas_wei);
  if(aGas!==bGas)return aGas>bGas?-1:1;
  return b.observed_transactions-a.observed_transactions;
 });
}

export function selectReceiptChecks(wallets,limit=MAX_RECEIPTS){
 if(!int(limit,0,MAX_RECEIPTS))throw Error('Invalid receipt limit');
 const selected=[],seen=new Set();
 // Spread sampled receipts across top operators; do not inspect arbitrary wallets at scale.
 for(const wallet of wallets.slice(0,8)){
  for(const hash of wallet.transaction_hashes.slice(0,2)){
   if(selected.length>=limit)break;
   if(!seen.has(hash)){selected.push(hash);seen.add(hash)}
  }
 }
 return selected;
}

export async function observeBase({
 rpc=async()=>{throw Error('RPC unavailable');},blockCount=MAX_BLOCKS,receiptLimit=MAX_RECEIPTS,now=new Date().toISOString()
}={}){
 if(!int(blockCount,1,MAX_BLOCKS)||!int(receiptLimit,0,MAX_RECEIPTS))throw Error('Invalid scan limits');
 const chain=await rpc('eth_chainId',[]);
 if(chain!==CHAIN_ID)throw Error('Unexpected network chain id');
 const head=parseQty(await rpc('eth_blockNumber',[]));
 if(head===null||head<10n)throw Error('Invalid Base head');
 const blocks=[],failures=[];
 // Confirmed block samples only; skip latest 4 to avoid preconfirmation/reorg noise.
 for(let i=0;i<blockCount;i++){
  const blockNumber=head-4n-BigInt(i*2);
  try{
   const block=await rpc('eth_getBlockByNumber',['0x'+blockNumber.toString(16),true]);
   if(block&&Array.isArray(block.transactions))blocks.push(block);
   else failures.push({block_number:blockNumber.toString(),reason:'missing_or_invalid_block'});
  }catch(error){failures.push({block_number:blockNumber.toString(),reason:String(error?.message||error).slice(0,140)})}
 }
 const sampled=sampleSenderActivity(blocks);
 const selected=selectReceiptChecks(sampled.wallets,receiptLimit),receipts=[];
 for(const hash of selected){
  try{receipts.push({transaction_hash:hash,receipt:await rpc('eth_getTransactionReceipt',[hash])})}
  catch(error){failures.push({transaction_hash:hash,reason:String(error?.message||error).slice(0,140)})}
 }
 const ranked=summarizeReceipts(sampled.wallets,receipts).filter(x=>x.observed_transactions>=2||x.sampled_failed_receipts>0);
 return {
  schema:'industrial-platform-base-demand-matrix/v1',
  generated_at:now,chain:'base',chain_id:8453,head_block:head.toString(),
  analysis_scope:'bounded_public_onchain_sample_not_network_wide_exhaustive',
  block_sample_limit:blockCount,blocks_successful:blocks.length,receipt_check_limit:receiptLimit,
  receipt_checks_attempted:selected.length,receipt_checks_successful:receipts.filter(x=>x.receipt).length,
  sampled_counts:sampled.counts,candidate_wallets_with_observed_signal:ranked.length,
  candidates:ranked.slice(0,15),failures,
  signal_note:'Repeated transactions or reverted execution gas do not prove bots, institutional volume, front-running loss, genuine demand, or willingness to purchase.',
  services_to_present_only_through_authorized_integrations:[
   {route:'/commerce/payment-intent-assurance',price_usdc:0.003,scope:'static_unsigned_x402_envelope_consistency_no_signature_or_MEV_protection'},
   {route:'/commerce/base-gas-fee-preflight',price_usdc:0.001,scope:'execution_only_fee_ceiling_excludes_L1_data_fee'}
  ],
  unsolicited_rpc_advertisements_sent:0,agent_wallet_transactions_submitted:0,
  factory_activations:0,qualified_external_revenue_usdc:0,
  promotion_allowed:false,reason:'IPTP layers 2,3 and product economics are unverified.'
 };
}

async function rpcRead(method,params){
 if(!RPC_METHODS.includes(method))throw Error('RPC method forbidden');
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),7000);
 try{
  const resp=await fetch(BASE_RPC,{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:controller.signal});
  if(!resp.ok)throw Error('public RPC HTTP '+resp.status);
  const len=Number(resp.headers.get('content-length')||0);
  if(len>8_000_000)throw Error('RPC response larger than configured limit');
  const raw=await resp.text();
  if(raw.length>8_000_000)throw Error('RPC response larger than configured limit');
  const decoded=JSON.parse(raw);
  if(decoded.error)throw Error('RPC rejected '+method+': '+String(decoded.error.code));
  if(!Object.prototype.hasOwnProperty.call(decoded,'result'))throw Error('Missing RPC result');
  await pause(280);
  return decoded.result;
 }finally{clearTimeout(timer)}
}
async function main(){
 let report;
 try{report=await observeBase({rpc:rpcRead})}
 catch(error){report={schema:'industrial-platform-base-demand-matrix/v1',
  generated_at:new Date().toISOString(),status:'scan_unavailable',error:String(error?.message||error),
  candidate_wallets_with_observed_signal:0,candidates:[],
  unsolicited_rpc_advertisements_sent:0,agent_wallet_transactions_submitted:0,
  qualified_external_revenue_usdc:0,factory_activations:0,promotion_allowed:false}}
 await mkdir('factory/out',{recursive:true});
 await writeFile('factory/out/base-demand-matrix.json',JSON.stringify(report,null,2)+'\n');
 process.stdout.write(JSON.stringify({
  status:report.status||'read_only_scan_complete',blocks:report.blocks_successful||0,
  examined_transactions:report.sampled_counts?.observed_transactions||0,
  receipt_checks:report.receipt_checks_successful||0,ranked_wallets:report.candidate_wallets_with_observed_signal,
  outreach:0,activation:0,external_revenue_usdc:0,
  warning:report.error||report.signal_note
 })+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();

// Conservative per-request x402 paid delivery correlation.
// Logs only the settlement RESPONSE header's safe public fields, never signed
// authorization headers or client credentials. A header alone is not chain proof.
const TX=/^0x[a-fA-F0-9]{64}$/;
const ACCOUNT=/^0x[a-fA-F0-9]{40}$/;
const INT=/^(0|[1-9][0-9]{0,29})$/;
const BASE='eip155:8453';

export function decodeSettlementHeader(header){
 if(typeof header!=='string'||header.length>8192||!/^[A-Za-z0-9+/_-]+={0,2}$/.test(header))return null;
 try{
  const urlSafe=header.replace(/-/g,'+').replace(/_/g,'/');
  const bytes=Buffer.from(urlSafe,'base64');
  if(bytes.length===0||bytes.length>4096)return null;
  const response=JSON.parse(bytes.toString('utf8'));
  if(!response||typeof response!=='object'||Array.isArray(response))return null;
  const transaction=response.transaction;
  if(response.success!==true||response.network!==BASE||!TX.test(transaction||''))return null;
  if(response.payer!==undefined&&response.payer!==null&&!ACCOUNT.test(response.payer))return null;
  if(response.amount!==undefined&&(!INT.test(response.amount)||BigInt(response.amount)===0n))return null;
  return {
   transaction:transaction.toLowerCase(),network:BASE,
   payer:response.payer?response.payer.toLowerCase():null,
   amount_atomic_usdc:response.amount??null
  };
 }catch{return null}
}

export function correlationRecord({method,path,httpStatus,hasPayment,settlementHeader,observedAt}={}){
 if(hasPayment!==true||!Number.isSafeInteger(httpStatus)||httpStatus<200||httpStatus>=300)return null;
 if(typeof path!=='string'||!/^\/[a-zA-Z0-9/_-]{1,180}$/.test(path)||method!=='POST'&&method!=='GET')return null;
 const receipt=decodeSettlementHeader(settlementHeader);
 if(!receipt)return null;
 return Object.freeze({
  event_type:'x402_paid_delivery_response',
  method,path,http_status:httpStatus,
  transaction:receipt.transaction,payer:receipt.payer,network:receipt.network,
  claimed_amount_atomic_usdc:receipt.amount_atomic_usdc,
  payment_response_header_seen:true,
  paid_http_2xx_observed:true,
  chain_receipt_verified:false,
  funds_to_correct_payee_verified:false,
  independently_funded_verified:false,
  production_purpose_verified:false,
  incremental_cost_verified:false,
  externally_earned_revenue_verified:false,
  observed_at:observedAt||new Date().toISOString()
 });
}

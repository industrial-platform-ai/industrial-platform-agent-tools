// Hourly read-only service-factory planning engine.
// It cannot spend money, cause audits, scrape arbitrary targets, or deploy.
// A paid completion is only a signal; it is not independent-production proof.
import {writeFile, mkdir} from 'node:fs/promises';
import {activeFactoryIds} from '../gateway/factory-active.mjs';
import {KNOWN_FACTORY_PRODUCTS} from '../gateway/factory-products.mjs';

const ORIGIN='https://x402-gateway-production-1f21.up.railway.app';
const CANDIDATES=[
 {id:'verification-preflight',routes:['/commerce/payment-diagnostic','/commerce/endpoint-health']},
 {id:'receipt-finality-report',routes:['/commerce/usdc-receipt','/commerce/tx-outcome','/agent/transaction-watch']},
 {id:'multi-site-change-report',routes:['/change','/web/monitor','/commerce/material-web-change']}
];
const PROBE=/audit|verif|probe|crawler|index|scan|test|seed|synthetic|benchmark|canary|monitor|healthcheck|observatory|settledscout|toolvet|vet402|carbonmonitor|coinbasebazaar|nohumans|reliability|taifoon|internal|localhost|unknown/i;
const INTEGER=(n)=>Number.isSafeInteger(n)&&n>=0?n:0;
const routeCompletions=(metrics,path)=>INTEGER(metrics?.byRoute?.[path]?.paidCompletions);
function classify(metrics){
 const uas=Object.entries(metrics?.byUserAgent||{});
 const candidates=[];
 for(const spec of CANDIDATES){
   const completionCount=spec.routes.reduce((sum,path)=>sum+routeCompletions(metrics,path),0);
   const possibleProduction=uas.filter(([ua])=>!PROBE.test(ua)).reduce((sum,[,record])=>
      sum+spec.routes.reduce((x,path)=>x+INTEGER(record?.routes?.[path]?.paidCompletions),0),0);
   candidates.push({
     id:spec.id,routes:spec.routes,all_completed_paid_calls_since_gateway_boot:completionCount,
     unknown_production_intent_paid_completions:possibleProduction,
     independently_verified_production_calls:0,
     evidence_state:'unverified',
     activated:activeFactoryIds.includes(spec.id)
   });
 }
 return candidates.sort((a,b)=>b.unknown_production_intent_paid_completions-a.unknown_production_intent_paid_completions);
}
async function main(){
 let responseStatus=null,metrics=null,error=null;
 try{
  const resp=await fetch(ORIGIN+'/metrics/x402.json',{signal:AbortSignal.timeout(12000)});
  responseStatus=resp.status;
  if(!resp.ok)throw Error('metrics HTTP '+resp.status);
  metrics=await resp.json();
 }catch(e){error=String(e?.message||e);}
 const candidates=classify(metrics);
 const report={
  generated_at:new Date().toISOString(),poll_status:responseStatus,error,
  origin:ORIGIN,method:'read_only_http_metrics',observed_since:metrics?.startedAt||null,
  live_factory_products:activeFactoryIds,
  available_vetted_product_templates:KNOWN_FACTORY_PRODUCTS,
  ranked_candidates:candidates,
  next_qualified_candidate:candidates.find(x=>!x.activated&&x.unknown_production_intent_paid_completions>0)?.id||null,
  promoted_product:null,
  promotion_allowed:false,
  reason:'No independent Base receipt + settled HTTP 2xx + production-purpose attribution ledger is yet integrated with factory. Gateway metrics alone cannot unlock promotion.',
  hourly_actions:['read real production telemetry','rank three distinct vetted templates','publish auditable planning artifact'],
  no_payment_or_external_invocation:true
 };
 await mkdir('factory/out',{recursive:true});
 await writeFile('factory/out/hourly-report.json',JSON.stringify(report,null,2)+'\n');
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
 if(error)process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});

// Pre-tested, genuinely different task compositions. Never auto-generate arbitrary code.
const KNOWN_FACTORY_PRODUCTS = Object.freeze(['verification-preflight', 'receipt-finality-report', 'multi-site-change-report']);
const bad = (message) => Object.assign(new Error(message), {statusCode:400});
export function buildFactoryProducts({commerceTools, runChange, activeIds=[]}={}) {
  if (!Array.isArray(activeIds) || activeIds.length>KNOWN_FACTORY_PRODUCTS.length ||
      new Set(activeIds).size!==activeIds.length || !activeIds.every(id=>KNOWN_FACTORY_PRODUCTS.includes(id)))
    throw Error('Unapproved factory product activation');
  if (!Array.isArray(commerceTools) || typeof runChange!=='function') throw Error('Missing existing factory handlers');
  const lookup = (route) => {
    const t=commerceTools.find(t=>t.route===route);
    if(!t || typeof t.run!=='function') throw Error('Missing factory source tool '+route);
    return t.run;
  };
  const payment=lookup('/commerce/payment-diagnostic');
  const endpoint=lookup('/commerce/endpoint-health');
  const receipt=lookup('/commerce/usdc-receipt');
  const terminal=lookup('/commerce/tx-outcome');
  const addr = {type:'string',pattern:'^0x[a-fA-F0-9]{40}$'};
  const tx = {type:'string',pattern:'^0x[a-fA-F0-9]{64}$'};
  const products = [
    {
      id:'verification-preflight',name:'agent-verification-preflight',route:'/factory/verification-preflight',
      price:'$0.004',priceUsd:0.004,
      description:'One explicitly operator-authorized endpoint health test plus buyer-side Base USDC x402 challenge validation against the buyer supplied wallet limits and payee allowlist. Never signs or buys.',
      tags:['agent','x402','auditor','verification','payment-preflight'],
      inputSchema:{type:'object',additionalProperties:false,properties:{
        url:{type:'string',format:'uri'},operator_authorized:{type:'boolean',const:true},challenge:{type:'object'},
        max_atomic_usdc:{type:'string',pattern:'^\\d{1,24}$'},
        allowed_payees:{type:'array',items:addr,minItems:1,maxItems:20}
      },required:['url','operator_authorized','challenge','max_atomic_usdc','allowed_payees']},
      example:{url:'https://example.com/',operator_authorized:true,challenge:{accepts:[{scheme:'exact',network:'eip155:8453',asset:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',payTo:'0xF7Eb4b12D673dF433d76B2DBD9CA41Db3fE1836E',amount:'1000'}]},max_atomic_usdc:'1000',allowed_payees:['0xF7Eb4b12D673dF433d76B2DBD9CA41Db3fE1836E']},
      run:async input=>{
        if(input?.operator_authorized!==true) throw bad('Explicit target operator authorization is required.');
        // Explicit authorization is mandatory; input URLs flow through the existing SSRF-safe HEAD handler.
        const diagnostic=await payment(input);
        const health=await endpoint({url:input.url,operator_authorized:true});
        return {status:'ready',diagnostic,health,transactions_submitted:0,paid_purchases_initiated:0,
          scope:'one authorized public HEAD and local challenge analysis',checked_at:new Date().toISOString()};
      }
    },
    {
      id:'receipt-finality-report',name:'agent-receipt-finality-report',route:'/factory/receipt-finality',
      price:'$0.005',priceUsd:0.005,
      description:'Combine a Base USDC seller receipt check with onchain transaction terminal-status evidence in one independently callable report. Does not claim HTTP fulfillment or production buyer intent.',
      tags:['x402','USDC','receipt','transaction','verification'],
      inputSchema:{type:'object',properties:{tx_hash:tx},required:['tx_hash'],additionalProperties:false},
      example:{tx_hash:'0x'+'0'.repeat(64)},
      run:async input=>{
        const [r,t]=await Promise.all([receipt(input),terminal({tx_hash:input.tx_hash,network:'base'})]);
        return {status:'ready',tx_hash:input.tx_hash,receipt:r,terminal_outcome:t,
          x402_execution_verified:false,production_intent_verified:false,transactions_submitted:0,
          checked_at:new Date().toISOString()};
      }
    },
    {
      id:'multi-site-change-report',name:'agent-multi-site-change-report',route:'/factory/multi-site-change',
      price:'$0.009',priceUsd:0.009,
      description:'One capped comparison of two or three public websites against caller supplied SHA-256 baselines. Returns distinct per-site changes and next-run hashes. No unattended polling or crawler triggering.',
      tags:['web','change-detection','batch','monitoring','research'],
      inputSchema:{type:'object',properties:{checks:{type:'array',minItems:2,maxItems:3,items:{
        type:'object',properties:{url:{type:'string',format:'uri'},previous_hash:{type:'string',pattern:'^[a-fA-F0-9]{64}$'}},
        required:['url','previous_hash'],additionalProperties:false
      }}},required:['checks'],additionalProperties:false},
      example:{checks:[{url:'https://example.com/',previous_hash:'0'.repeat(64)},{url:'https://example.org/',previous_hash:'0'.repeat(64)}]},
      run:async input=>{
        if(!Array.isArray(input?.checks) || input.checks.length<2 || input.checks.length>3 ||
          input.checks.some(c=>!c||typeof c.url!=='string'||!/^https?:\\/\\//.test(c.url)||
            !/^[a-fA-F0-9]{64}$/.test(c.previous_hash))) throw bad('Two or three public URLs with valid previous hashes are required.');
        const outcomes=await Promise.allSettled(input.checks.map(c=>runChange({url:c.url,previous_hash:c.previous_hash,include_current_text:false})));
        const results=outcomes.map((o,i)=>o.status==='fulfilled'
          ? {url:input.checks[i].url,ok:true,changed:o.value.changed,current_hash:o.value.current_hash,
             checked_at:o.value.checked_at,source_http_status:o.value.http_status}
          : {url:input.checks[i].url,ok:false,error:String(o.reason?.message||o.reason).slice(0,240)});
        const succeeded=results.filter(r=>r.ok).length;
        if(succeeded===0) throw Object.assign(new Error('All public website checks failed'),{statusCode:502});
        return {status:succeeded===results.length?'ready':'partial',checked_at:new Date().toISOString(),
          attempted:results.length,succeeded,failed:results.length-succeeded,results,transactions_submitted:0};
      }
    }
  ];
  return activeIds.map(id=>{
    const product=products.find(x=>x.id===id);
    const {id:_,...tool}=product;
    return Object.freeze(tool);
  });
}
export {KNOWN_FACTORY_PRODUCTS};

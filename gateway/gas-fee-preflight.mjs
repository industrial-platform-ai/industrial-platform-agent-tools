// Fixed-precision gas ceiling preflight. Estimates execution gas only; on Base
// L1 data fees may be additional and are explicitly not included.
const UINT=/^\d{1,30}$/;
const bad=m=>Object.assign(new Error(m),{statusCode:400});
export function estimateBaseFee(input,gasState){
 if(!input||!gasState||input.network&&input.network!=='base')throw bad('Base gas preflight only');
 const limit=Number(input.gas_limit);
 if(!Number.isSafeInteger(limit)||limit<21000||limit>3000000)throw bad('gas_limit must be 21000-3000000');
 const cap=String(input.max_execution_fee_wei||'');
 if(!UINT.test(cap)||BigInt(cap)===0n)throw bad('positive max_execution_fee_wei required');
 const gas=String(gasState.gas_price_wei||'');
 if(!UINT.test(gas))throw Object.assign(new Error('RPC gas price unavailable'),{statusCode:502});
 const base=String(gasState.base_fee_per_gas_wei||'');
 const estimated=BigInt(gas)*BigInt(limit);
 const ceiling=BigInt(cap);
 return {status:'ready',network:'base',gas_limit:limit,observed_gas_price_wei:gas,
  observed_base_fee_per_gas_wei:UINT.test(base)?base:null,
  estimated_l2_execution_fee_wei:estimated.toString(),
  max_execution_fee_wei:cap,within_execution_fee_ceiling:estimated<=ceiling,
  over_ceiling_wei:estimated>ceiling?(estimated-ceiling).toString():'0',
  observed_block_number:gasState.block_number??null,observed_at:gasState.fetched_at||new Date().toISOString(),
  estimated_l1_data_fee_wei:null,full_transaction_cost_verified:false,transaction_signed:false,
  warning:'Execution-only estimate at observed gas price. Base L1 data fees, priority volatility, network changes, fee-sponsored operations and actual gas used are not included; not a guarantee of maximum total transaction cost.'};
}
export function buildGasPreflightTools({networkTools}={}){
 const gas=networkTools?.find(t=>t.name==='chain-gas-state');
 if(!gas||typeof gas.run!=='function')throw Error('Existing chain-gas-state handler required');
 return [{
  name:'base-gas-execution-fee-preflight',route:'/commerce/base-gas-fee-preflight',price:'$0.001',priceUsd:0.001,
  description:'Read-only Base execution-gas estimate compared to caller-defined wei fee ceiling. Does not quote total Base transaction fees (L1 data fee unknown), nor transact. Costs $0.001 Base USDC via x402.',
  tags:['gas','base','transaction','fees','preflight','cost-ceiling','x402'],
  inputSchema:{type:'object',properties:{
   network:{type:'string',enum:['base'],default:'base'},
   gas_limit:{type:'integer',minimum:21000,maximum:3000000},
   max_execution_fee_wei:{type:'string',pattern:'^\\d{1,30}$'}
  },required:['gas_limit','max_execution_fee_wei'],additionalProperties:false},
  example:{network:'base',gas_limit:65000,max_execution_fee_wei:'10000000000000'},
  run:async input=>estimateBaseFee(input,await gas.run({network:'base'}))
 }];
}

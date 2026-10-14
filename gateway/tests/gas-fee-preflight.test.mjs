import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateBaseFee,buildGasPreflightTools} from '../gas-fee-preflight.mjs';
const state={gas_price_wei:'100000000',base_fee_per_gas_wei:'70000000',block_number:10,fetched_at:'2026-10-13T00:00:00Z'};
test('exact BigInt price under cap',()=>{const r=estimateBaseFee({gas_limit:65000,max_execution_fee_wei:'6500000000000'},state);assert.equal(r.estimated_l2_execution_fee_wei,'6500000000000');assert.equal(r.within_execution_fee_ceiling,true);assert.equal(r.full_transaction_cost_verified,false);});
test('reject above ceiling without signing',()=>{const r=estimateBaseFee({gas_limit:65000,max_execution_fee_wei:'6499999999999'},state);assert.equal(r.within_execution_fee_ceiling,false);assert.equal(r.over_ceiling_wei,'1');assert.equal(r.transaction_signed,false);});
test('invalid bounds rejected',()=>{assert.throws(()=>estimateBaseFee({gas_limit:1,max_execution_fee_wei:'10'},state));assert.throws(()=>estimateBaseFee({gas_limit:21000,max_execution_fee_wei:'0'},state));assert.throws(()=>estimateBaseFee({gas_limit:21000,max_execution_fee_wei:'10',network:'ethereum'},state));});
test('existing gas handler is reused, no wallet activity',async()=>{const t=buildGasPreflightTools({networkTools:[{name:'chain-gas-state',run:async()=>state}]});assert.equal(t.length,1);assert.equal(t[0].priceUsd,0.001);assert.equal((await t[0].run({gas_limit:21000,max_execution_fee_wei:'2100000000000'})).within_execution_fee_ceiling,true);});

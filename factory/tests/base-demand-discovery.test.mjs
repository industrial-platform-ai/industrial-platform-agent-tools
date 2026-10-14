import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleSenderActivity,summarizeReceipts,selectReceiptChecks,observeBase,MAX_BLOCKS,MAX_RECEIPTS} from '../base-demand-discovery.mjs';
const a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40),hash=x=>'0x'+x.repeat(64);
const block=(n,tx)=>({number:'0x'+n.toString(16),transactions:tx});
const tx=(sender,h)=>({from:sender,hash:hash(h)});
test('bounded block sampling ranks unique payer activity, never fabricated bot identity',()=>{
 const s=sampleSenderActivity([
  block(20,[tx(a,'1'),tx(b,'2')]),block(21,[tx(a,'3'),tx(a,'4'),tx('junk','5')])
 ]);
 assert.equal(s.counts.observed_transactions,4);
 assert.equal(s.wallets[0].address,a);
 assert.equal(s.wallets[0].observed_transactions,3);
 assert.equal(s.wallets[0].observed_blocks,2);
 assert.equal(s.counts.rows_skipped,1);
 assert.throws(()=>sampleSenderActivity(Array.from({length:MAX_BLOCKS+1},()=>block(1,[]))),/Invalid sampling bounds/);
});
test('duplicate transaction hashes never inflate sample',()=>{
 const s=sampleSenderActivity([block(20,[tx(a,'1')]),block(21,[tx(a,'1')])]);
 assert.equal(s.counts.observed_transactions,1);
 assert.equal(s.counts.rows_skipped,1);
});
test('failed gas accounting requires confirmed failure receipt, not guessed sandwich/MEV',()=>{
 const ws=sampleSenderActivity([block(20,[tx(a,'1'),tx(a,'2'),tx(b,'3')])]).wallets;
 const r=summarizeReceipts(ws,[
  {transaction_hash:hash('1'),receipt:{status:'0x0',gasUsed:'0x5208',effectiveGasPrice:'0x64',l1Fee:'0xa'}},
  {transaction_hash:hash('2'),receipt:{status:'0x1',gasUsed:'0x5208',effectiveGasPrice:'0x64'}},
  {transaction_hash:hash('3'),receipt:{status:'0x0',gasUsed:'bad',effectiveGasPrice:'0x64'}}
 ]);
 const A=r.find(x=>x.address===a),B=r.find(x=>x.address===b);
 assert.equal(A.sampled_failed_receipts,1);
 assert.equal(A.sampled_receipts_checked,2);
 assert.equal(A.observed_failed_execution_gas_wei,String(21000n*100n));
 assert.equal(A.observed_failed_l1_fee_wei,'10');
 assert.equal(A.mev_or_front_running_causation,'unverified');
 assert.equal(A.factory_promotion_allowed,false);
 assert.equal(B.failed_fee_observation_incomplete,true);
 assert.equal(B.observed_failed_execution_gas_wei,'0');
});
test('safely caps receipt sampling and rejects negative or oversized budgets',()=>{
 const ws=sampleSenderActivity([block(20,[tx(a,'1'),tx(a,'2'),tx(b,'3')])]).wallets;
 assert.equal(selectReceiptChecks(ws,2).length,2);
 assert.throws(()=>selectReceiptChecks(ws,MAX_RECEIPTS+1),/Invalid receipt limit/);
});
test('mocked RPC report contains no promotion, spending or unsupported agent claims',async()=>{
 const blocks=new Map([['0x3c',block(60,[tx(a,'1'),tx(b,'2')])],['0x3a',block(58,[tx(a,'3')])]]);
 const calls=[];
 const rpc=async (method,args)=>{
  calls.push(method);
  if(method==='eth_chainId')return '0x2105';
  if(method==='eth_blockNumber')return '0x40';
  if(method==='eth_getBlockByNumber')return blocks.get(args[0])||block(Number.parseInt(args[0],16),[]);
  if(method==='eth_getTransactionReceipt')return {status:args[0]===hash('1')?'0x0':'0x1',gasUsed:'0x5208',effectiveGasPrice:'0x64'};
  throw Error('Disallowed method '+method);
 };
 const report=await observeBase({rpc,blockCount:2,receiptLimit:2,now:'2026-10-14T03:00:00.000Z'});
 assert.equal(report.blocks_successful,2);
 assert.equal(report.sampled_counts.observed_transactions,3);
 assert.equal(report.candidate_wallets_with_observed_signal,1);
 assert.equal(report.candidates[0].address,a);
 assert.equal(report.qualified_external_revenue_usdc,0);
 assert.equal(report.unsolicited_rpc_advertisements_sent,0);
 assert.equal(report.agent_wallet_transactions_submitted,0);
 assert.equal(report.factory_activations,0);
 assert.equal(report.promotion_allowed,false);
 assert.ok(!calls.includes('eth_sendRawTransaction'));
});
test('chain mismatch or invalid boundaries always fail closed',async()=>{
 await assert.rejects(observeBase({rpc:async()=> '0x1'}),/Unexpected network/);
 await assert.rejects(observeBase({blockCount:9}),/Invalid scan limits/);
});

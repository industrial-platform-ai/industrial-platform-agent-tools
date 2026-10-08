import test from 'node:test';
import assert from 'node:assert/strict';
import {inferenceTools} from '../inference.mjs';

const tool=inferenceTools[0];
const originalFetch=globalThis.fetch;
const savedKey=process.env.OPENROUTER_API_KEY;
const savedEnabled=process.env.INDUSTRIAL_INFERENCE_ENABLED;
const example={messages:[{role:'user',content:'Say hello.'}]};

test.after(()=>{
  globalThis.fetch=originalFetch;
  if(savedKey===undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY=savedKey;
  if(savedEnabled===undefined) delete process.env.INDUSTRIAL_INFERENCE_ENABLED; else process.env.INDUSTRIAL_INFERENCE_ENABLED=savedEnabled;
});

test('rejects oversized input before upstream request', async()=>{
  await assert.rejects(tool.run({messages:[{role:'user',content:'A'.repeat(4001)}]}), e=>e.statusCode===400);
});

test('rejects nontext modalities and excessive output caps', async()=>{
  await assert.rejects(tool.run({messages:[{role:'user',content:[{type:'image_url',image_url:'https://example.com'}]}]}), e=>e.statusCode===400);
  await assert.rejects(tool.run({...example,max_completion_tokens:10000}), e=>e.statusCode===400);
});

test('refuses unconfigured upstream', async()=>{
  delete process.env.OPENROUTER_API_KEY;
  process.env.INDUSTRIAL_INFERENCE_ENABLED='false';
  await assert.rejects(tool.run(example), e=>e.statusCode===503);
});

test('valid inference uses allowlisted model and bounded provider price', async()=>{
  process.env.OPENROUTER_API_KEY='qa-placeholder-key';
  process.env.INDUSTRIAL_INFERENCE_ENABLED='true';
  let sent;
  globalThis.fetch=async (url,opts)=>{
    sent={url,opts,body:JSON.parse(opts.body)};
    return {ok:true,text:async()=>JSON.stringify({
      choices:[{message:{content:'Hello'},finish_reason:'stop'}],
      usage:{prompt_tokens:8,completion_tokens:2,total_tokens:10}
    })};
  };
  const response=await tool.run(example);
  assert.equal(sent.url,'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(sent.body.model,'google/gemini-3.1-flash-lite');
  assert.deepEqual(sent.body.provider.max_price,{prompt:0.25,completion:1.5});
  assert.equal(sent.body.max_tokens,256);
  assert.equal(sent.body.reasoning.effort,'minimal');
  assert.equal(sent.body.stream,false);
  assert.equal(response.output,'Hello');
  assert.equal(response.price_usdc,0.003);
  assert.equal(response.usage.total_tokens,10);
});

test('converts failed upstream attempts into non-settled errors', async()=>{
  globalThis.fetch=async ()=>({ok:false,status:429});
  await assert.rejects(tool.run(example), e=>e.statusCode===502&&!String(e.message).includes('qa-placeholder-key'));
});

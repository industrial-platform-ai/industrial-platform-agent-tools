import test from 'node:test';
import assert from 'node:assert/strict';
import {inferenceTools} from '../inference.mjs';

const tool=inferenceTools[0];
const originalFetch=globalThis.fetch;
const savedKey=process.env.OPENROUTER_API_KEY;
const savedEnabled=process.env.INDUSTRIAL_INFERENCE_ENABLED;
const example={task:'triage',text:'API returned 502 errors repeatedly.'};
test.after(()=>{
  globalThis.fetch=originalFetch;
  if(savedKey===undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY=savedKey;
  if(savedEnabled===undefined) delete process.env.INDUSTRIAL_INFERENCE_ENABLED; else process.env.INDUSTRIAL_INFERENCE_ENABLED=savedEnabled;
});
test('exposes task-specific product instead of generic completions',()=>{
  assert.equal(tool.route,'/ai/agent-analysis');
  assert.equal(tool.priceUsd,0.003);
  assert.deepEqual(tool.inputSchema.properties.task.enum,['digest','triage','action_items']);
  assert.ok(!('messages' in tool.inputSchema.properties));
});
test('rejects oversize, arbitrary prompts and nontext input', async()=>{
  await assert.rejects(tool.run({task:'digest',text:'A'.repeat(4001)}), e=>e.statusCode===400);
  await assert.rejects(tool.run({task:'freeform',text:'hi'}), e=>e.statusCode===400);
  await assert.rejects(tool.run({task:'digest',text:'hi',messages:[]}), e=>e.statusCode===400);
  await assert.rejects(tool.run({task:'digest',text:[1,2]}), e=>e.statusCode===400);
});
test('remains off without funded operator enablement',async()=>{
  delete process.env.OPENROUTER_API_KEY;
  process.env.INDUSTRIAL_INFERENCE_ENABLED='false';
  await assert.rejects(tool.run(example),e=>e.statusCode===503);
});
test('produces structured result with fixed model and cost ceiling',async()=>{
  process.env.OPENROUTER_API_KEY='ci-placeholder-do-not-use';
  process.env.INDUSTRIAL_INFERENCE_ENABLED='true';
  let request;
  globalThis.fetch=async (url,opts)=>{
    request={url,options:JSON.parse(opts.body)};
    return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({
      priority:'high',category:'API reliability',reason:'Repeated HTTP 502 failures',suggested_next_step:'Check upstream failures'
    })}}],usage:{prompt_tokens:80,completion_tokens:40,total_tokens:120}})};
  };
  const result=await tool.run(example);
  assert.equal(request.url,'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(request.options.model,'google/gemini-3.1-flash-lite');
  assert.equal(request.options.max_tokens,384);
  assert.equal(request.options.reasoning.effort,'minimal');
  assert.deepEqual(request.options.provider.max_price,{prompt:0.25,completion:1.50});
  assert.equal(request.options.response_format.type,'json_object');
  assert.equal(request.options.messages.length,2);
  assert.equal(result.result.priority,'high');
  assert.equal(result.usage.total_tokens,120);
  assert.equal(result.price_usdc,0.003);
});
test('rejects malformed provider output without leaking upstream content',async()=>{
  globalThis.fetch=async()=>({ok:true,text:async()=>JSON.stringify({choices:[{message:{content:'Not JSON'}}]})});
  await assert.rejects(tool.run(example),e=>e.statusCode===502);
  globalThis.fetch=async()=>({ok:false,status:429});
  await assert.rejects(tool.run(example),e=>e.statusCode===502);
});

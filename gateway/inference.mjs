// Optional, margin-guarded x402 inference resale.
// This tool is only registered by server.mjs when the operator enables it and
// configures a funded OpenRouter key. No buyer secrets are required.
const MODEL='google/gemini-3.1-flash-lite-preview';
const MODEL_INPUT_USD_PER_M=0.25;
const MODEL_OUTPUT_USD_PER_M=1.50;
const PRICE_USD=0.003;
const MAX_INPUT_BYTES=4000;
const MAX_OUTPUT_TOKENS=512;
const MAX_REPLY_BYTES=1000000;

function invalid(message){
  throw Object.assign(new Error(message),{statusCode:400});
}
function parseRequest(input){
  if(!input||typeof input!=='object'||Array.isArray(input)) invalid('Expected a JSON object.');
  const allowed=['messages','max_completion_tokens','temperature'];
  if(Object.keys(input).some(k=>!allowed.includes(k))) invalid('Unsupported request field. Use messages, max_completion_tokens and temperature.');
  const messages=input.messages;
  if(!Array.isArray(messages)||messages.length<1||messages.length>6) invalid('messages must contain 1 to 6 text messages.');
  if(messages.at(-1)?.role!=='user') invalid('The final message must have role user.');
  for(const msg of messages){
    if(!msg||typeof msg!=='object'||Array.isArray(msg)||Object.keys(msg).some(k=>!['role','content'].includes(k))) invalid('Each message must contain only role and text content.');
    if(!['system','user','assistant'].includes(msg.role)) invalid('Invalid message role.');
    if(typeof msg.content!=='string'||!msg.content.trim()) invalid('Message content must be nonempty text.');
  }
  const totalBytes=messages.reduce((s,m)=>s+Buffer.byteLength(m.content,'utf8'),0);
  if(totalBytes>MAX_INPUT_BYTES) invalid('Maximum combined message size is 4000 UTF-8 bytes.');
  const maxTokens=input.max_completion_tokens===undefined?256:input.max_completion_tokens;
  if(!Number.isInteger(maxTokens)||maxTokens<16||maxTokens>MAX_OUTPUT_TOKENS) invalid('max_completion_tokens must be an integer between 16 and 512.');
  const temperature=input.temperature===undefined?0.3:input.temperature;
  if(typeof temperature!=='number'||!Number.isFinite(temperature)||temperature<0||temperature>1) invalid('temperature must be between 0 and 1.');
  return {messages,maxTokens,temperature};
}

async function runInference(input){
  const {messages,maxTokens,temperature}=parseRequest(input);
  const apiKey=process.env.OPENROUTER_API_KEY;
  if(!apiKey||process.env.INDUSTRIAL_INFERENCE_ENABLED!=='true'){
    throw Object.assign(new Error('Inference temporarily unavailable.'),{statusCode:503});
  }
  let response;
  try{
    response=await fetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',
      headers:{
        'authorization':'Bearer '+apiKey,
        'content-type':'application/json',
        'accept':'application/json',
        'HTTP-Referer':'https://github.com/industrial-platform-ai/industrial-platform-agent-tools',
        'X-Title':'Industrial Platform x402 Inference'
      },
      signal:AbortSignal.timeout(35000),
      body:JSON.stringify({
        model:MODEL,
        messages,
        temperature,
        max_completion_tokens:maxTokens,
        stream:false,
        modalities:['text'],
        provider:{max_price:{prompt:MODEL_INPUT_USD_PER_M,completion:MODEL_OUTPUT_USD_PER_M}}
      })
    });
  }catch{
    throw Object.assign(new Error('Inference upstream timed out or was unreachable.'),{statusCode:502});
  }
  if(!response.ok){
    // Never echo provider auth errors, quota metadata or other upstream internals.
    throw Object.assign(new Error('Inference provider unavailable (HTTP '+response.status+').'),{statusCode:502});
  }
  const body=await response.text();
  if(Buffer.byteLength(body,'utf8')>MAX_REPLY_BYTES) throw Object.assign(new Error('Inference response exceeded size limit.'),{statusCode:502});
  let data;
  try{data=JSON.parse(body);}catch{throw Object.assign(new Error('Inference provider returned invalid JSON.'),{statusCode:502});}
  const answer=data?.choices?.[0]?.message?.content;
  if(typeof answer!=='string') throw Object.assign(new Error('Inference provider returned no text response.'),{statusCode:502});
  const promptTokens=Number(data?.usage?.prompt_tokens);
  const completionTokens=Number(data?.usage?.completion_tokens);
  const usage=Number.isFinite(promptTokens)&&Number.isFinite(completionTokens)
    ?{prompt_tokens:promptTokens,completion_tokens:completionTokens,total_tokens:Number(data?.usage?.total_tokens)||promptTokens+completionTokens}
    :null;
  return {
    status:'ready',
    model:MODEL,
    output:answer,
    finish_reason:data?.choices?.[0]?.finish_reason||null,
    usage,
    cost_estimate_usd:usage?Number(((promptTokens*MODEL_INPUT_USD_PER_M+completionTokens*MODEL_OUTPUT_USD_PER_M)/1000000).toFixed(8)):null,
    price_usdc:PRICE_USD,
    note:'Cost estimate uses published per-token rates, not an upstream invoice.',
    generated_at:new Date().toISOString()
  };
}
export const inferenceTools=[{
  name:'ai-inference-lite',
  route:'/ai/inference',
  price:'$0.003',
  priceUsd:PRICE_USD,
  summary:'Low-cost text AI completion paid via x402 USDC',
  description:'Text-only inference from Gemini 3.1 Flash-Lite through OpenRouter. Fixed $0.003 USDC per request on Base, up to 4000 UTF-8 input bytes and 512 completion tokens. Stateless assistant completion; no signup, buyer API key, tools or streaming. Available only while upstream is funded and explicitly enabled.',
  tags:['ai','inference','llm','text generation','chat completion','agent','x402','usdc','base'],
  inputSchema:{
    type:'object',
    properties:{
      messages:{type:'array',minItems:1,maxItems:6,items:{type:'object',properties:{
        role:{type:'string',enum:['system','user','assistant']},
        content:{type:'string',minLength:1}
      },required:['role','content'],additionalProperties:false}},
      max_completion_tokens:{type:'integer',minimum:16,maximum:512,default:256},
      temperature:{type:'number',minimum:0,maximum:1,default:0.3}
    },
    required:['messages'],additionalProperties:false
  },
  example:{messages:[{role:'user',content:'Summarize the purpose of x402 in one sentence.'}],max_completion_tokens:128},
  run:runInference
}];

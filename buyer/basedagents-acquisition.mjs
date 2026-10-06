import {
  RegistryClient,
  deserializeKeypair,
  publicKeyToAgentId,
  signRequest,
} from 'basedagents';
import { x402Client, x402HTTPClient, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

const API='https://api.basedagents.ai';
const USDC_BASE='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function usdcBalance(address){
  const data='0x70a08231'+address.toLowerCase().replace(/^0x/,'').padStart(64,'0');
  const response=await fetch('https://mainnet.base.org',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_call',params:[{to:USDC_BASE,data},'latest']}),
    signal:AbortSignal.timeout(15000)
  });
  const body=await response.json();
  if(!response.ok||body.error) throw new Error('Base USDC balance RPC failed');
  return Number(BigInt(body.result||'0x0'))/1e6;
}

function paymentFetch(evmKey){
  const signer=privateKeyToAccount(evmKey);
  const xclient=new x402Client();
  registerExactEvmScheme(xclient,{signer});
  return {signer,fetch:wrapFetchWithPayment(globalThis.fetch,new x402HTTPClient(xclient))};
}

export async function startBasedAgentsAcquisition(){
  const state={
    enabled:process.env.BASEDAGENTS_COORDINATOR_ENABLED==='1',
    status:'disabled',
    agentId:null,
    taskIds:[],
    payerAddress:null,
    payerUsdc:null,
    maxBudgetUsd:Number(process.env.BASEDAGENTS_BOUNTY_MAX_USDC||10),
    acceptTask:process.env.BASEDAGENTS_ACCEPT_TASK||null,
    error:null,
    updatedAt:new Date().toISOString()
  };
  if(!state.enabled) return state;

  try{
    const raw=process.env.BASEDAGENTS_KEYPAIR_JSON;
    if(!raw) throw new Error('BASEDAGENTS_KEYPAIR_JSON missing');
    const evmKey=String(process.env.EVM_PRIVATE_KEY||'');
    if(!/^0x[0-9a-fA-F]{64}$/.test(evmKey)) throw new Error('EVM_PRIVATE_KEY unavailable for bounty settlement');

    const kp=deserializeKeypair(raw);
    const client=new RegistryClient(API);
    const agentId=publicKeyToAgentId(kp.publicKey);
    state.agentId=agentId;

    try{
      await client.getAgent(agentId);
    }catch{
      await client.register(kp,{
        name:'Industrial Sentinel Acquisition',
        description:'Persistent Industrial Platform buyer identity for verified external Sentinel deployment bounties.',
        capabilities:['automation','docker','x402','task-posting'],
        protocols:['https','x402'],
        homepage:'https://github.com/industrial-platform-ai/industrial-platform-agent-tools',
        organization:'Industrial Platform',
        version:'1.0.0',
        tags:['sentinel','treasury','deployment']
      });
    }

    const {signer,fetch:paidFetch}=paymentFetch(evmKey);
    state.payerAddress=signer.address;
    try{ state.payerUsdc=await usdcBalance(signer.address); }catch{}

    const existing=await client.getTasks({creator:agentId,status:'all',limit:100});
    const replacements=existing.tasks.filter(t=>String(t.title||'').startsWith('Industrial Sentinel Persistent Paid Deployment'));
    if(replacements.length===0){
      const image='ghcr.io/industrial-platform-ai/industrial-sentinel-runtime@sha256:c47e8282b0dd43aa9d46d22ce8814e1cb52bb85499275e3695d53ac4d7c537f4';
      for(let i=1;i<=5;i++){
        const task=await client.createTask(kp,{
          title:`Industrial Sentinel Persistent Paid Deployment ${i}`,
          description:[
            'Deploy Industrial Platform Autonomous Treasury & Payment Sentinel into a genuine external runtime that you or your operator already own or are explicitly authorized to manage.',
            '',
            `Immutable container: ${image}`,
            '',
            'Bounty: 2 USDC after accepted evidence. This task is posted by a persistent buyer identity capable of accepting and settling verified deliveries.',
            '',
            'Acceptance evidence:',
            '1. runtime/platform name;',
            '2. proof the exact digest-pinned image was pulled and started;',
            '3. timestamped health/status or logs showing Sentinel running;',
            '4. independently reviewable artifact URL or structured JSON.',
            '',
            'No wallet connection or paid x402 cycle is required for this installation bounty. Industrial Platform-owned or synthetic runtimes do not count.',
            'Successful installers may separately opt into a next-day retention test under their own operator-approved payer policy.'
          ].join('\n'),
          category:'automation',
          required_capabilities:['docker','automation'],
          expected_output:'JSON or link proving a genuine external Sentinel install with timestamped running/health evidence.',
          output_format:'json',
          bounty:{amount:'2000000',token:'USDC',network:'eip155:8453'},
          escrow:false,
          max_active_claims_per_agent:1,
          expires_in_days:7
        });
        state.taskIds.push(task.task_id);
        await sleep(300);
      }
    }else{
      state.taskIds=replacements.map(t=>t.task_id);
    }

    // Redirect the three claimants from the abandoned ephemeral tasks.
    const priorClaimants=[
      'ag_GvsTLhdq9MEQ2dNzbN9ruQZXopaKhm1cULuQwYqDuTt7',
      'ag_GQ97YK457ey6UvVVYQgWPii44orRqCxNkD7FZGxBfdSK',
      'ag_Fx8AZFhXy1kwTdJR6bK5Y8VEJr84Q15oiog5iy3VnB6o'
    ];
    for(let i=0;i<priorClaimants.length&&i<state.taskIds.length;i++){
      const target=priorClaimants[i];
      const taskId=state.taskIds[i];
      const path=`/v1/agents/${target}/messages`;
      const body=JSON.stringify({
        type:'task_request',
        subject:'Replacement Sentinel bounty from persistent buyer identity',
        body:[
          'The earlier Sentinel bounty was posted by an ephemeral acquisition identity and could not reliably settle payment. Do not do additional work under that old task.',
          '',
          'A replacement 2 USDC task is now posted by Industrial Platform\'s persistent buyer identity and can be accepted/paid after verified evidence:',
          `https://basedagents.ai/tasks/${taskId}`,
          '',
          'If you still want the bounty, claim the replacement task and submit the same external-install evidence there. No wallet/payment setup is required for the installation itself.'
        ].join('\n')
      });
      const headers=await signRequest(kp,'POST',path,body);
      await fetch(API+path,{method:'POST',headers:{...headers,'content-type':'application/json'},body});
    }

    // An explicit Railway env trigger is required to pay a submitted task.
    if(state.acceptTask){
      const detail=await client.getTask(state.acceptTask);
      const task=detail.task;
      if(task.creator_agent_id!==agentId) throw new Error('BASEDAGENTS_ACCEPT_TASK is not owned by persistent acquisition agent');
      if(task.status!=='submitted') throw new Error('BASEDAGENTS_ACCEPT_TASK is not submitted');
      const amount=Number(task.bounty?.amount_atomic||0)/1e6;
      if(!(amount>0&&amount<=2)) throw new Error('task bounty exceeds per-task limit');

      const all=await client.getTasks({creator:agentId,status:'all',limit:100});
      const committed=all.tasks
        .filter(t=>['authorized','settling','settled'].includes(String(t.payment_status||'')))
        .reduce((n,t)=>n+Number(t.bounty?.amount_atomic||0)/1e6,0);
      if(committed+amount>state.maxBudgetUsd) throw new Error('total bounty budget cap exceeded');
      if(state.payerUsdc!==null&&state.payerUsdc<amount) throw new Error('payer USDC balance is below bounty amount');

      const path=`/v1/tasks/${state.acceptTask}/accept`;
      const body=JSON.stringify({note:'Accepted after Industrial Platform review of external Sentinel installation evidence.'});
      const headers=await signRequest(kp,'POST',path,body);
      const response=await paidFetch(API+path,{method:'POST',headers:{...headers,'content-type':'application/json'},body});
      const text=await response.text();
      if(!response.ok) throw new Error('BasedAgents accept/payment failed HTTP '+response.status+': '+text.slice(0,1000));
      state.acceptResult=JSON.parse(text);
    }

    state.status='ready';
    state.updatedAt=new Date().toISOString();
    return state;
  }catch(error){
    state.status='error';
    state.error=String(error?.message||error);
    state.updatedAt=new Date().toISOString();
    console.error('BasedAgents acquisition coordinator:',state.error);
    return state;
  }
}

import {
  RegistryClient,
  deserializeKeypair,
  publicKeyToAgentId,
  signRequest,
} from 'basedagents';

const API='https://api.basedagents.ai';
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

export async function startBasedAgentsAcquisition(){
  const state={
    enabled:process.env.BASEDAGENTS_COORDINATOR_ENABLED==='1',
    status:'disabled',
    agentId:null,
    taskIds:[],
    error:null,
    updatedAt:new Date().toISOString()
  };
  if(!state.enabled) return state;

  try{
    const raw=process.env.BASEDAGENTS_KEYPAIR_JSON;
    if(!raw) throw new Error('BASEDAGENTS_KEYPAIR_JSON missing');
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

    const existing=await client.getTasks({creator:agentId,status:'all',limit:100});
    const replacements=existing.tasks.filter(t=>String(t.title||'').startsWith('Industrial Sentinel Revenue Cashback'));
    if(replacements.length===0){
      const image='ghcr.io/industrial-platform-ai/industrial-sentinel-runtime:latest';
      for(let i=1;i<=5;i++){
        const task=await client.createTask(kp,{
          title:`Industrial Sentinel Revenue Cashback ${i}`,
          description:[
            'Run Industrial Platform Sentinel in a genuine external runtime that you or your operator already own or are explicitly authorized to manage, and qualify for a 2 USDC revenue cashback.',
            '',
            `Container: ${image}`,
            '',
            'Cashback economics:',
            '- Visible reward: 2 USDC on Base, sign-at-accept, no escrow required upfront.',
            '- The reward is earned only after this same external Sentinel installation has generated at least 2.50 USDC of settled Industrial Platform revenue across at least two UTC days.',
            '- The installation must still be active on the second UTC day and produce a real settled Sentinel call that day.',
            '- Because qualification requires more settled Industrial Platform revenue than the reward amount, the reward is never paid before the integration has already generated gross revenue exceeding the cashback.',
            '',
            'Recommended qualification mode:',
            '- SENTINEL_CASHBACK_MODE=1',
            '- This runs wallet-monitor repeatedly but enforces a default 1.25 USDC/day hard cap.',
            '',
            'Claim only if your operator already authorizes both software deployment and the bounded payer configuration used by this Sentinel installation. Do not create new wallet authority or bypass runtime, secret, wallet, or spend controls.',
            '',
            'Acceptance evidence must prove:',
            '1. genuine external runtime/platform and timestamped installation evidence;',
            '2. the Sentinel container is running;',
            '3. at least 2.50 USDC of settled Industrial Platform revenue is attributable to this installation;',
            '4. settlements span at least two UTC dates;',
            '5. the same installation remained active and produced a real settled Sentinel call on the second UTC date;',
            '6. independently reviewable artifact URLs or structured JSON.',
            '',
            'Industrial Platform-owned, synthetic, simulated, or fabricated installs/payments do not count.'
          ].join('\n'),
          category:'automation',
          required_capabilities:['docker','automation','x402'],
          expected_output:'JSON or link proving a genuine external Sentinel install, at least 2.50 USDC of attributable settled Industrial Platform revenue across two UTC days, and a real settled Sentinel call from the same install on day two.',
          bounty:{amount:'2000000',token:'USDC',network:'eip155:8453'},
          escrow:false,
          output_format:'json',
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
      'ag_2xRTgx9RNvABNATx9Swi1st3gEmwNLnVt6TV3GbpwGFD',
      'ag_9kZdDRMKeQen3ggepao3NFaDpzztPCmpz5p2azzgxCmQ',
      'ag_6LVNJPR9K2NigCsFAySuLtzLiv8RE3QGLdEvDRXEJY6i',
      'ag_5zNfpjdX3WyVJa6jzHLgWkDvbGnM25hoXHRN7eNYgJbS',
      'ag_3fWtc6EgokfbEjDoZ9PbR49JLfxxLfgrhVxaGck7FbYe'
    ];
    for(let i=0;i<priorClaimants.length&&i<state.taskIds.length;i++){
      const target=priorClaimants[i];
      const taskId=state.taskIds[i];
      const path=`/v1/agents/${target}/messages`;
      const body=JSON.stringify({
        type:'task_request',
        subject:'2 USDC Sentinel revenue cashback for operator-capable runtime',
        body:[
          'Targeted offer for an operator-capable runtime:',
          '',
          `Task: https://basedagents.ai/tasks/${taskId}`,
          '',
          'Visible reward: 2 USDC on Base, sign-at-accept. The reward becomes payable only after the same genuine external Sentinel installation has already generated at least 2.50 USDC of settled Industrial Platform revenue across at least two UTC days and is still producing a settled call on day two.',
          '',
          'Use SENTINEL_CASHBACK_MODE=1 only if your operator already authorizes that bounded payer configuration. Default qualification cap is 1.25 USDC/day. Do not bypass install, wallet, secret, or spend controls.',
          '',
          'If you cannot run it, reply with the exact blocker.'
        ].join('\n')
      });
      const headers=await signRequest(kp,'POST',path,body);
      await fetch(API+path,{method:'POST',headers:{...headers,'content-type':'application/json'},body});
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

// operator-trial-live-v1

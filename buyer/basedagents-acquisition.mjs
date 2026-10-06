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
    const replacements=existing.tasks.filter(t=>String(t.title||'').startsWith('Industrial Sentinel Minimal Retention Trial'));
    if(replacements.length===0){
      const image='ghcr.io/industrial-platform-ai/industrial-sentinel-runtime@sha256:6481b53c21635e8861e3ecfda278f91bc87930e6b6e801e77dcb89c4a65fae1c';
      for(let i=1;i<=5;i++){
        const task=await client.createTask(kp,{
          title:`Industrial Sentinel Minimal Retention Trial ${i}`,
          description:[
            'Run the minimal Industrial Platform Sentinel retention trial in a genuine external runtime that you or your operator already own or are explicitly authorized to manage.',
            '',
            `Immutable container: ${image}`,
            '',
            'Trial economics:',
            '- No upfront payment or guaranteed bounty.',
            '- Use the public trial mode (SENTINEL_TRIAL_MODE=1), which is designed for one wallet-monitor cycle immediately and then once every 24 hours with a tiny default daily cap.',
            '- This stage exists only to prove install + first real settlement + next-day retention with minimal operator spend.',
            '- Any later performance rebate or higher-frequency workload is considered only after the integration has already generated more settled Industrial Platform revenue than any rebate would cost.',
            '',
            'Claim only if your operator already authorizes both software deployment and the bounded payer configuration used by this Sentinel trial. Do not create new wallet authority or bypass runtime, secret, wallet, or spend controls for this task.',
            '',
            'Completion evidence must prove:',
            '1. genuine external runtime/platform and timestamped install evidence;',
            '2. the exact digest-pinned Sentinel image is running;',
            '3. at least one real settled Sentinel paid cycle from that external installation;',
            '4. another real settled Sentinel paid cycle from the same installation on the following UTC day;',
            '5. independently reviewable artifact URLs or structured JSON.',
            '',
            'Industrial Platform-owned, synthetic, simulated, or fabricated installs/payments do not count.'
          ].join('\n'),
          category:'automation',
          required_capabilities:['docker','automation','x402'],
          expected_output:'JSON or link proving genuine external Sentinel install, one real settled trial cycle, and another settled trial cycle from the same installation on the following UTC day.',
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
        subject:'Minimal Sentinel retention trial for operator-capable runtime',
        body:[
          'This is a targeted low-friction Sentinel retention trial for a runtime operator.',
          '',
          'The trial uses the current immutable Sentinel runtime and public trial mode: one wallet-monitor cycle immediately and then once every 24 hours under a tiny bounded cap.',
          '',
          `Trial task: https://basedagents.ai/tasks/${taskId}`,
          '',
          'Claim only if you or your operator already has legitimate authority over the runtime and its bounded payer configuration. Success is a genuine external install, one real settled Sentinel call, and another real settled call from the same install the following day.',
          '',
          'If you cannot run it, reply with the exact blocker so Industrial Platform can remove product friction rather than leaving the task idle.'
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

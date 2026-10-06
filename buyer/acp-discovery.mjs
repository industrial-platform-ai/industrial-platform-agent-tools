import { privateKeyToAccount } from 'viem/accounts';

const ACP_API='https://api.acp.virtuals.io';
const CHAIN_ID=8453;

async function authToken(){
  const raw=process.env.EVM_PRIVATE_KEY;
  if(!raw) throw new Error('EVM_PRIVATE_KEY missing');
  const pk=raw.startsWith('0x')?raw:`0x${raw}`;
  const account=privateKeyToAccount(pk);
  const message=`acp-auth:${Date.now()}`;
  const signature=await account.signMessage({message});
  const res=await fetch(`${ACP_API}/auth/agent`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({walletAddress:account.address,signature,message,chainId:CHAIN_ID})
  });
  const body=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(`ACP auth failed ${res.status}: ${JSON.stringify(body)}`);
  const token=body?.data?.token;
  if(!token) throw new Error('ACP auth returned no token');
  return {token,address:account.address};
}

async function search(token,query){
  const u=new URL('/agents/search',ACP_API);
  u.searchParams.set('query',query);
  u.searchParams.set('isOnline','online');
  u.searchParams.set('topK','25');
  u.searchParams.set('sortBy','successfulJobCount,successRate,minsFromLastOnlineTime');
  const res=await fetch(u,{headers:{authorization:`Bearer ${token}`}});
  const body=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(`ACP search ${query} failed ${res.status}: ${JSON.stringify(body)}`);
  return body?.data||[];
}

export async function discoverAcpDirectHireCandidates(){
  const state={status:'starting',buyer:null,queries:{},candidates:[],error:null,updatedAt:new Date().toISOString()};
  try{
    const {token,address}=await authToken();
    state.buyer={walletAddress:address,chainId:CHAIN_ID,authenticated:true};
    const queries=['deployment automation','docker deployment','devops','runtime automation','cloud deployment','openclaw'];
    const all=[];
    for(const q of queries){
      try{
        const rows=await search(token,q);
        state.queries[q]=rows;
        for(const a of rows) all.push({...a,_query:q});
      }catch(e){state.queries[q]={error:String(e?.message||e)};}
    }
    const seen=new Set();
    state.candidates=all.filter(a=>{
      const k=(a.walletAddress||a.id||a.name||'').toLowerCase();
      if(!k||seen.has(k)) return false;
      seen.add(k); return true;
    });
    state.status='ready';
  }catch(e){
    state.status='error'; state.error=String(e?.message||e);
  }
  state.updatedAt=new Date().toISOString();
  console.log('ACP direct-hire discovery',JSON.stringify({status:state.status,buyer:state.buyer,candidateCount:state.candidates.length,error:state.error}));
  return state;
}

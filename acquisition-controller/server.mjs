import http from 'node:http';
const PORT=Number(process.env.PORT||3000);
const TARGET='https://x402-gateway-production-1f21.up.railway.app';
const INTERVAL=300000;
const allowed=['/health','/.well-known/x402','/pricing.json','/metrics/x402-24h.json'];
let state={startedAt:new Date().toISOString(),lastRun:null,runs:0,results:[],errors:[]};
async function check(){
 const results=[];
 for(const path of allowed){
  try {
   const response=await fetch(TARGET+path,{method:'GET',signal:AbortSignal.timeout(12000),redirect:'error',headers:{'User-Agent':'IndustrialPlatform-Acquisition-Controller/1.0 (read-only; no purchases)'}});
   const bytes=(await response.text()).length;
   results.push({path,status:response.status,bytes,at:new Date().toISOString()});
  }catch(e){results.push({path,error:String(e.message).slice(0,160),at:new Date().toISOString()});}
 }
 state={...state,lastRun:new Date().toISOString(),runs:state.runs+1,results};
 console.log(JSON.stringify({type:'ACQUISITION_READ_ONLY',...state}));
}
const server=http.createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 res.setHeader('Content-Type','application/json');
 if(path==='/health'){res.writeHead(200);return res.end(JSON.stringify({ok:true,mode:'read-only',uptimeSeconds:Math.floor(process.uptime()),runs:state.runs,lastRun:state.lastRun}));}
 if(path==='/status'){res.writeHead(200);return res.end(JSON.stringify({mode:'read-only',...state}));}
 res.writeHead(404);res.end(JSON.stringify({error:'not_found'}));
});
server.listen(PORT,'0.0.0.0',()=>{console.log('Acquisition controller started read-only');void check();setInterval(()=>void check(),INTERVAL).unref();});

import dns from 'node:dns/promises';
import net from 'node:net';
import ipaddr from 'ipaddr.js';

const BLOCKED_HOST_SUFFIXES=['.localhost','.local','.internal','.home','.lan'];

function publicIp(address){
  try{return ipaddr.process(address).range()==='unicast';}catch{return false;}
}
function blockedHost(hostname){
  const h=String(hostname||'').toLowerCase().replace(/\.$/,'');
  return !h||h==='localhost'||BLOCKED_HOST_SUFFIXES.some(s=>h.endsWith(s));
}
async function validatePublicUrl(raw){
  let u; try{u=new URL(raw);}catch{throw Object.assign(new Error('url is invalid.'),{statusCode:400});}
  if(!['http:','https:'].includes(u.protocol)) throw Object.assign(new Error('Only http(s) URLs are supported.'),{statusCode:400});
  if(u.username||u.password||blockedHost(u.hostname)) throw Object.assign(new Error('Local/private or credentialed URLs are not allowed.'),{statusCode:400});
  if(net.isIP(u.hostname)){
    if(!publicIp(u.hostname)) throw Object.assign(new Error('Non-public IP addresses are not allowed.'),{statusCode:400});
  }else{
    const rows=await dns.lookup(u.hostname,{all:true,verbatim:true});
    if(!rows.length||rows.some(r=>!publicIp(r.address))) throw Object.assign(new Error('Hostname resolves to a non-public address.'),{statusCode:400});
  }
  return u;
}

const CHAIN_RPCS = {
  base:'https://mainnet.base.org',
  ethereum:'https://cloudflare-eth.com'
};
function chainInput(input){
  const network=String(input?.network||'base').toLowerCase();
  if(!Object.hasOwn(CHAIN_RPCS,network)) throw Object.assign(new Error('network must be base or ethereum.'),{statusCode:400});
  return network;
}
function evmAddress(value,label='address'){
  const address=String(value||'').trim();
  if(!/^0x[a-fA-F0-9]{40}$/.test(address)) throw Object.assign(new Error(label+' must be a 20-byte EVM address.'),{statusCode:400});
  return address;
}
async function rpcCall(network,method,params=[]){
  const response=await fetch(CHAIN_RPCS[network],{
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json','user-agent':'IndustrialPlatform-ChainRead/1.0'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),
    signal:AbortSignal.timeout(10000)
  });
  const body=await response.json().catch(()=>null);
  if(!response.ok||body?.error||body?.result===undefined) throw Object.assign(new Error('RPC request failed.'),{statusCode:502,upstream:body?.error||null});
  return body.result;
}
function balanceOfData(address){
  return '0x70a08231'+address.slice(2).toLowerCase().padStart(64,'0');
}
function hexToDecimal(value){
  try{return BigInt(value||'0x0').toString(10);}catch{return null;}
}

function hostInput(input){
  const host=String(input?.host||input?.name||'').trim().toLowerCase().replace(/\.$/,'');
  if(!host||host.length>253||blockedHost(host)||net.isIP(host)) throw Object.assign(new Error('host must be a public DNS hostname.'),{statusCode:400});
  return host;
}
async function resolveRecord(host,type){
  switch(type){
    case 'A': return dns.resolve4(host);
    case 'AAAA': return dns.resolve6(host);
    case 'MX': return dns.resolveMx(host);
    case 'TXT': return (await dns.resolveTxt(host)).map(parts=>parts.join(''));
    case 'NS': return dns.resolveNs(host);
    case 'CNAME': return dns.resolveCname(host);
    case 'SOA': return [await dns.resolveSoa(host)];
    case 'CAA': return dns.resolveCaa(host);
    case 'SRV': return dns.resolveSrv(host);
    default: throw Object.assign(new Error('Unsupported DNS record type.'),{statusCode:400});
  }
}
function headersObject(headers){
  const out={}; for(const [k,v] of headers.entries()) out[k]=v; return out;
}
function securityAnalysis(headers){
  const checks=[
    ['strict-transport-security','HSTS'],
    ['content-security-policy','CSP'],
    ['x-frame-options','X-Frame-Options'],
    ['x-content-type-options','X-Content-Type-Options'],
    ['referrer-policy','Referrer-Policy'],
    ['permissions-policy','Permissions-Policy'],
    ['cross-origin-opener-policy','COOP'],
    ['cross-origin-resource-policy','CORP'],
    ['cross-origin-embedder-policy','COEP']
  ];
  const findings=checks.map(([key,label])=>({header:label,present:headers.has(key),value:headers.get(key)}));
  const present=findings.filter(x=>x.present).length;
  const warnings=[];
  const hsts=headers.get('strict-transport-security');
  if(hsts&&!/max-age\s*=\s*(?:[3-9]\d{7,}|[1-9]\d{8,})/i.test(hsts)) warnings.push('HSTS max-age may be shorter than one year.');
  if(headers.has('server')) warnings.push('Server header exposes implementation information.');
  if(headers.has('x-powered-by')) warnings.push('X-Powered-By exposes implementation information.');
  return {score:Math.round((present/checks.length)*100),findings,warnings};
}
function parseRobots(text,userAgent){
  const lines=text.split(/\r?\n/).map(x=>x.replace(/#.*$/,'').trim()).filter(Boolean);
  const groups=[]; let current=null;
  for(const line of lines){
    const i=line.indexOf(':'); if(i<0) continue;
    const key=line.slice(0,i).trim().toLowerCase(), value=line.slice(i+1).trim();
    if(key==='user-agent'){
      if(!current||current.rules.length){current={agents:[],rules:[]};groups.push(current);}
      current.agents.push(value.toLowerCase());
    }else if((key==='allow'||key==='disallow')&&current){
      current.rules.push({type:key,path:value});
    }
  }
  const ua=String(userAgent||'*').toLowerCase();
  const matches=groups.filter(g=>g.agents.some(a=>a==='*'||ua.includes(a)||a.includes(ua)));
  const specific=matches.filter(g=>g.agents.some(a=>a!=='*'));
  return specific.length?specific:matches.filter(g=>g.agents.includes('*'));
}
function robotsDecision(groups,path){
  const rules=groups.flatMap(g=>g.rules).filter(r=>r.path!==''&&path.startsWith(r.path));
  if(!rules.length) return {allowed:true,matched_rule:null};
  rules.sort((a,b)=>b.path.length-a.path.length||(a.type==='allow'?-1:1));
  const rule=rules[0];
  return {allowed:rule.type==='allow',matched_rule:rule};
}

export const networkTools=[
  {
    name:'dns-lookup',route:'/dns',price:'$0.001',priceUsd:0.001,
    description:'Resolve public DNS records for a hostname. Supports A, AAAA, MX, TXT, NS, CNAME, SOA, CAA and SRV using the system resolver.',
    tags:['dns','domain','network','mx','txt','cname','lookup'],
    inputSchema:{type:'object',properties:{host:{type:'string'},type:{type:'string',enum:['A','AAAA','MX','TXT','NS','CNAME','SOA','CAA','SRV']}},required:['host'],additionalProperties:false},
    example:{host:'example.com',type:'A'},
    run:async input=>{
      const host=hostInput(input),type=String(input?.type||'A').toUpperCase();
      try{const records=await resolveRecord(host,type);return{host,type,records,count:records.length,queried_at:new Date().toISOString()};}
      catch(error){if(error?.statusCode)throw error;throw Object.assign(new Error('DNS lookup failed: '+String(error?.code||error?.message||error)),{statusCode:502});}
    }
  },
  {
    name:'http-headers-security',route:'/http/headers',price:'$0.001',priceUsd:0.001,
    description:'Fetch a public URL with HEAD or GET and return status, final URL, latency, response headers and security-header analysis for HSTS, CSP, framing, MIME sniffing, referrer, permissions and cross-origin policies.',
    tags:['http','headers','security','status','web','audit','uptime'],
    inputSchema:{type:'object',properties:{url:{type:'string',format:'uri'},method:{type:'string',enum:['HEAD','GET']}},required:['url'],additionalProperties:false},
    example:{url:'https://example.com/',method:'HEAD'},
    run:async input=>{
      let current=await validatePublicUrl(input?.url); const method=input?.method||'HEAD'; const started=Date.now();
      for(let redirects=0;redirects<=4;redirects++){
        const response=await fetch(current,{method,redirect:'manual',headers:{'user-agent':'IndustrialPlatform-HTTPHeaders/1.0','accept':'*/*'},signal:AbortSignal.timeout(10000)});
        if([301,302,303,307,308].includes(response.status)){
          const location=response.headers.get('location'); if(!location)break;
          current=await validatePublicUrl(new URL(location,current).href); continue;
        }
        const headers=headersObject(response.headers);
        return{url:String(input.url),final_url:current.href,status:response.status,status_text:response.statusText,latency_ms:Date.now()-started,headers,security:securityAnalysis(response.headers),checked_at:new Date().toISOString()};
      }
      throw Object.assign(new Error('Too many redirects.'),{statusCode:502});
    }
  },
  {
    name:'robots-check',route:'/web/robots-check',price:'$0.001',priceUsd:0.001,
    description:'Robots.txt compliance check for crawlers and AI agents. Fetch a public site robots.txt and determine whether a user-agent may crawl a path; return the matched allow/disallow rule, crawl policy, HTTP status and declared sitemap URLs.',
    tags:['robots','robots.txt','crawl','crawler','seo','web','policy','sitemap','agent'],
    inputSchema:{type:'object',properties:{url:{type:'string',format:'uri'},path:{type:'string'},user_agent:{type:'string'}},required:['url'],additionalProperties:false},
    outputSchema:{type:'object',properties:{origin:{type:'string'},robots_url:{type:'string'},http_status:{type:'integer'},user_agent:{type:'string'},path:{type:'string'},allowed:{type:'boolean'},matched_rule:{},rules:{type:'array',items:{type:'object'}},sitemaps:{type:'array',items:{type:'string'}},fetched_at:{type:'string'}},required:['origin','robots_url','http_status','user_agent','path','allowed','rules','sitemaps','fetched_at']},
    example:{url:'https://example.com/',path:'/',user_agent:'*'},
    run:async input=>{
      const u=await validatePublicUrl(input?.url);
      const robotsUrl=new URL('/robots.txt',u.origin);
      const response=await fetch(robotsUrl,{headers:{'user-agent':'IndustrialPlatform-RobotsCheck/1.0'},signal:AbortSignal.timeout(10000)});
      const text=response.ok?await response.text():'';
      const path=String(input?.path||u.pathname||'/'); const userAgent=String(input?.user_agent||'*');
      const groups=parseRobots(text,userAgent); const decision=response.status===404?{allowed:true,matched_rule:null}:robotsDecision(groups,path);
      const sitemaps=text.split(/\r?\n/).map(x=>x.trim()).filter(x=>/^sitemap\s*:/i.test(x)).map(x=>x.replace(/^sitemap\s*:/i,'').trim()).slice(0,100);
      return{origin:u.origin,robots_url:robotsUrl.href,http_status:response.status,user_agent:userAgent,path,...decision,rules:groups.flatMap(g=>g.rules).slice(0,500),sitemaps,fetched_at:new Date().toISOString()};
    }
  },
  {
    name:'chain-block-number',operationId:'block-number',route:'/chain/block-number',price:'$0.001',priceUsd:0.001,
    description:'Latest EVM block height for Base or Ethereum via eth_blockNumber. Use for chain-tip checks, block polling, synchronization, indexers, trading agents and recurring blockchain monitoring.',
    tags:['blockchain','block-number','block-height','base','ethereum','rpc','evm','monitoring'],
    inputSchema:{type:'object',properties:{network:{type:'string',enum:['base','ethereum'],default:'base'}},additionalProperties:false},
    example:{network:'base'},
    run:async input=>{
      const network=chainInput(input);
      const raw=await rpcCall(network,'eth_blockNumber',[]);
      return{network,block_number:Number(BigInt(raw)),block_number_hex:raw,fetched_at:new Date().toISOString()};
    }
  },
  {
    name:'chain-native-balance',operationId:'wallet-balance',route:'/chain/native-balance',price:'$0.001',priceUsd:0.001,
    description:'Live native ETH balance for any public EVM wallet on Base or Ethereum via eth_getBalance. Returns exact wei as a decimal string for agents, portfolio monitors and blockchain automation.',
    tags:['blockchain','wallet','balance','eth','base','ethereum','rpc','evm'],
    inputSchema:{type:'object',properties:{address:{type:'string',pattern:'^0x[a-fA-F0-9]{40}$'},network:{type:'string',enum:['base','ethereum'],default:'base'}},required:['address'],additionalProperties:false},
    example:{address:'0x0000000000000000000000000000000000000000',network:'base'},
    run:async input=>{
      const network=chainInput(input),address=evmAddress(input?.address);
      const raw=await rpcCall(network,'eth_getBalance',[address,'latest']);
      return{network,address,balance_wei:hexToDecimal(raw),balance_hex:raw,fetched_at:new Date().toISOString()};
    }
  },
  {
    name:'chain-erc20-balance',operationId:'erc20-balance',route:'/chain/erc20-balance',price:'$0.001',priceUsd:0.001,
    description:'ERC-20 token balance for any EVM wallet and token contract on Base or Ethereum via balanceOf eth_call. Returns the exact raw integer balance for USDC, USDT, DAI and arbitrary ERC-20 tokens.',
    tags:['blockchain','erc20','token','balance','wallet','usdc','base','ethereum','rpc'],
    inputSchema:{type:'object',properties:{address:{type:'string',pattern:'^0x[a-fA-F0-9]{40}$'},contract:{type:'string',pattern:'^0x[a-fA-F0-9]{40}$'},network:{type:'string',enum:['base','ethereum'],default:'base'}},required:['address','contract'],additionalProperties:false},
    example:{address:'0x0000000000000000000000000000000000000000',contract:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',network:'base'},
    run:async input=>{
      const network=chainInput(input),address=evmAddress(input?.address),contract=evmAddress(input?.contract,'contract');
      const raw=await rpcCall(network,'eth_call',[{to:contract,data:balanceOfData(address)},'latest']);
      return{network,address,contract,balance_raw:hexToDecimal(raw),balance_hex:raw,fetched_at:new Date().toISOString()};
    }
  },
  {
    name:'chain-live-balance',operationId:'crypto-wallet-balance',route:'/chain/live-balance',price:'$0.001',priceUsd:0.001,
    description:'Live wallet balance in one call: native ETH plus up to 20 caller-supplied ERC-20 token balances on Base or Ethereum. Built for portfolio agents, treasury monitors, wallet intelligence and recurring balance polling.',
    tags:['blockchain','wallet','balance','erc20','portfolio','treasury','base','ethereum','rpc'],
    inputSchema:{type:'object',properties:{address:{type:'string',pattern:'^0x[a-fA-F0-9]{40}$'},network:{type:'string',enum:['base','ethereum'],default:'base'},tokens:{type:'array',items:{type:'string',pattern:'^0x[a-fA-F0-9]{40}$'},maxItems:20}},required:['address'],additionalProperties:false},
    example:{address:'0x0000000000000000000000000000000000000000',network:'base',tokens:['0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913']},
    run:async input=>{
      const network=chainInput(input),address=evmAddress(input?.address);
      const tokens=(Array.isArray(input?.tokens)?input.tokens:[]).map((x,i)=>evmAddress(x,'tokens['+i+']'));
      const [native,...tokenRows]=await Promise.all([
        rpcCall(network,'eth_getBalance',[address,'latest']),
        ...tokens.map(contract=>rpcCall(network,'eth_call',[{to:contract,data:balanceOfData(address)},'latest']).then(raw=>({contract,raw})))
      ]);
      return{
        network,address,
        native:{balance_wei:hexToDecimal(native),balance_hex:native},
        tokens:tokenRows.map(row=>({contract:row.contract,balance_raw:hexToDecimal(row.raw),balance_hex:row.raw})),
        fetched_at:new Date().toISOString()
      };
    }
  }
];

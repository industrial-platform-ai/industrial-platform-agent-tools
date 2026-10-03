import express from 'express';
import { paymentMiddleware } from '@x402/express';
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { declareDiscoveryExtension, bazaarResourceServerExtension } from '@x402/extensions/bazaar';
import { createCdpFacilitatorClient } from '@coinbase/cdp-sdk/x402';

const ORIGIN='https://x402-gateway-production-1f21.up.railway.app';
const PAY_TO=process.env.X402_PAY_TO || '0xF7Eb4b12D673dF433d76B2DBD9CA41Db3fE1836E';
const NETWORK='eip155:8453';
const PRICE='$0.001';
const FACILITATOR_MODE=String(process.env.X402_WALLET_FACILITATOR || 'roundhouse').toLowerCase();
const COINBASE_ALIAS='/wallet-balance/cdp';

const CHAIN_CONFIG={
  'eip155:8453':{
    rpc:'https://mainnet.base.org',
    network:'base',
    usdc:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
  },
  'eip155:1':{
    rpc:'https://cloudflare-eth.com',
    network:'ethereum',
    usdc:'0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
  }
};

const canonicalDescription='List a wallet\'s native ETH and USDC balances with human-readable amounts. Canonical wallet-balance contract for autonomous agents: address plus optional CAIP-2 chain.';
const canonicalInputSchema={
  type:'object',
  properties:{
    address:{type:'string',pattern:'^0x[a-fA-F0-9]{40}$',description:'The wallet address.'},
    chain:{type:'string',enum:['eip155:8453','eip155:1'],default:'eip155:8453',description:'CAIP-2 chain id.'}
  },
  required:['address'],
  additionalProperties:false
};
const canonicalOutputSchema={
  type:'object',
  properties:{
    address:{type:'string'},
    balances:{
      type:'array',
      items:{
        type:'object',
        properties:{
          symbol:{type:'string'},
          amount:{type:'number'}
        },
        required:['symbol','amount'],
        additionalProperties:false
      }
    }
  },
  required:['address','balances'],
  additionalProperties:false
};
const canonicalExample={
  address:'0x0000000000000000000000000000000000000000',
  balances:[
    {symbol:'ETH',amount:0},
    {symbol:'USDC',amount:0}
  ]
};

function balanceOfData(address){
  return '0x70a08231'+address.slice(2).toLowerCase().padStart(64,'0');
}
async function rpc(url,method,params){
  const response=await fetch(url,{
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json','user-agent':'IndustrialPlatform-WalletBalance/1.0'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),
    signal:AbortSignal.timeout(10000)
  });
  const body=await response.json().catch(()=>null);
  if(!response.ok || body?.error || body?.result===undefined){
    const error=new Error('RPC request failed.');
    error.statusCode=502;
    throw error;
  }
  return body.result;
}
function decimalAmount(raw,decimals){
  const n=BigInt(raw || '0');
  const negative=n<0n;
  const abs=negative?-n:n;
  const scale=10n**BigInt(decimals);
  const whole=abs/scale;
  const fraction=(abs%scale).toString().padStart(decimals,'0').replace(/0+$/,'');
  const text=(negative?'-':'')+whole.toString()+(fraction?'.'+fraction:'');
  return Number(text);
}
async function readCanonicalWallet(req){
  const address=String(req.query?.address||'').trim();
  if(!/^0x[a-fA-F0-9]{40}$/.test(address)){
    const error=new Error('address must be a 20-byte EVM address.');
    error.statusCode=400;
    throw error;
  }
  const chain=String(req.query?.chain||'eip155:8453').trim();
  const config=CHAIN_CONFIG[chain];
  if(!config){
    const error=new Error('chain must be eip155:8453 or eip155:1.');
    error.statusCode=400;
    throw error;
  }
  const [nativeRaw,usdcRaw]=await Promise.all([
    rpc(config.rpc,'eth_getBalance',[address,'latest']),
    rpc(config.rpc,'eth_call',[{to:config.usdc,data:balanceOfData(address)},'latest'])
  ]);
  return{
    address,
    balances:[
      {symbol:'ETH',amount:decimalAmount(nativeRaw,18)},
      {symbol:'USDC',amount:decimalAmount(usdcRaw,6)}
    ]
  };
}

const walletDiscovery=declareDiscoveryExtension({
  input:{address:'0x0000000000000000000000000000000000000000',chain:'eip155:8453'},
  inputSchema:canonicalInputSchema,
  output:{example:canonicalExample,schema:canonicalOutputSchema}
});

const walletFacilitator=FACILITATOR_MODE==='roundhouse'
  ? new HTTPFacilitatorClient({url:'https://x402.roundhouseai.io'})
  : createCdpFacilitatorClient();

const walletResourceServer=new x402ResourceServer(walletFacilitator);
walletResourceServer
  .register(NETWORK,new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension);

const coinbaseResourceServer=new x402ResourceServer(createCdpFacilitatorClient());
coinbaseResourceServer
  .register(NETWORK,new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension);

const coinbaseWalletPayment=paymentMiddleware({
  ['GET '+COINBASE_ALIAS]:{
    accepts:[{
      scheme:'exact',
      price:PRICE,
      network:NETWORK,
      payTo:PAY_TO,
      maxTimeoutSeconds:90
    }],
    resource:ORIGIN+COINBASE_ALIAS,
    description:canonicalDescription,
    mimeType:'application/json',
    serviceName:'Industrial Platform',
    tags:['wallet-balance','onchain-data','base','ethereum','agents'],
    extensions:{...walletDiscovery}
  }
},coinbaseResourceServer);

const walletPayment=paymentMiddleware({
  'GET /wallet-balance':{
    accepts:[{
      scheme:'exact',
      price:PRICE,
      network:NETWORK,
      payTo:PAY_TO,
      maxTimeoutSeconds:90
    }],
    resource:ORIGIN+'/wallet-balance',
    description:canonicalDescription,
    mimeType:'application/json',
    serviceName:'Industrial Platform',
    tags:['wallet-balance','onchain-data','base','ethereum','agents'],
    extensions:{...walletDiscovery}
  }
},walletResourceServer);

function patchManifest(body){
  if(!body || typeof body!=='object' || !Array.isArray(body.tools)) return body;
  const clone=JSON.parse(JSON.stringify(body));
  const tool=clone.tools.find(t=>t?.route==='/wallet-balance');
  if(tool){
    tool.name='wallet-balance';
    tool.method='GET';
    tool.description=canonicalDescription;
    tool.summary=canonicalDescription;
    tool.inputSchema=canonicalInputSchema;
  }
  if(!clone.tools.some(t=>t?.route===COINBASE_ALIAS)){
    clone.tools.push({
      name:'wallet-balance-cdp',
      method:'GET',
      route:COINBASE_ALIAS,
      priceUsd:0.001,
      summary:canonicalDescription,
      description:canonicalDescription,
      inputSchema:canonicalInputSchema,
      recommended:false,
      priority:null
    });
  }
  clone.resources=clone.tools.map(t=>ORIGIN+t.route);
  return clone;
}
function patchOpenApi(body){
  if(!body || typeof body!=='object') return body;
  const clone=JSON.parse(JSON.stringify(body));
  const operation=clone.paths?.['/wallet-balance']?.get;
  if(operation){
    operation.operationId='wallet-balance';
    operation.summary=canonicalDescription;
    operation.description=canonicalDescription;
    operation.parameters=[
      {name:'address',in:'query',required:true,schema:canonicalInputSchema.properties.address},
      {name:'chain',in:'query',required:false,schema:canonicalInputSchema.properties.chain}
    ];
    operation.responses=operation.responses||{};
    operation.responses['200']={
      description:'Wallet balances',
      content:{'application/json':{schema:canonicalOutputSchema}}
    };
  }
  if(!clone.paths[COINBASE_ALIAS]){
    clone.paths[COINBASE_ALIAS]={
      get:{
        operationId:'wallet-balance-cdp',
        'x-payment-info':{protocols:['x402'],price:{mode:'fixed',currency:'USD',amount:'0.001'}},
        summary:canonicalDescription,
        description:canonicalDescription,
        parameters:[
          {name:'address',in:'query',required:true,schema:canonicalInputSchema.properties.address},
          {name:'chain',in:'query',required:false,schema:canonicalInputSchema.properties.chain}
        ],
        responses:{
          '200':{description:'Wallet balances',content:{'application/json':{schema:canonicalOutputSchema}}},
          '400':{description:'Invalid input'},
          '402':{description:'x402 payment required'}
        }
      }
    };
  }
  return clone;
}
function patchAgentCard(body){
  if(!body || typeof body!=='object') return body;
  const clone=JSON.parse(JSON.stringify(body));
  if(Array.isArray(clone.capabilities)){
    for(const item of clone.capabilities){
      if(item?.path==='/wallet-balance') item.description=canonicalDescription;
    }
  }
  return clone;
}
function patchAgentInstall(body){
  if(!body || typeof body!=='object') return body;
  const clone=JSON.parse(JSON.stringify(body));
  for(const key of ['intents','tools']){
    if(Array.isArray(clone[key])){
      for(const item of clone[key]){
        if(item?.endpoint==='/wallet-balance' || item?.endpoint===ORIGIN+'/wallet-balance'){
          item.description=canonicalDescription;
        }
      }
    }
  }
  return clone;
}

const originalInit=express.application.init;
express.application.init=function(...args){
  const result=originalInit.apply(this,args);
  this.use((req,res,next)=>{
    if(req.method!=='GET') return next();
    const active=req.path==='/wallet-balance'
      ? walletPayment
      : (req.path===COINBASE_ALIAS ? coinbaseWalletPayment : null);
    if(!active) return next();
    return active(req,res,async err=>{
      if(err) return next(err);
      try{
        const result=await readCanonicalWallet(req);
        res.setHeader('X-Industrial-Wallet-Facilitator',FACILITATOR_MODE);
        return res.json(result);
      }catch(error){
        const code=Number(error?.statusCode)||502;
        return res.status(code).json({error:String(error?.message||error)});
      }
    });
  });
  return result;
};

const originalGet=express.application.get;
express.application.get=function(path,...handlers){
  if(handlers.length===0) return originalGet.call(this,path);
  const patcher=
    path==='/.well-known/x402' || path==='/.well-known/x402.json' ? patchManifest :
    path==='/openapi.json' ? patchOpenApi :
    path==='/.well-known/agent-card.json' ? patchAgentCard :
    path==='/.well-known/agent.json' ? patchAgentInstall :
    null;
  if(!patcher) return originalGet.call(this,path,...handlers);
  const wrapped=handlers.map(handler=>function(req,res,next){
    const originalJson=res.json.bind(res);
    res.json=body=>originalJson(patcher(body));
    return handler(req,res,next);
  });
  return originalGet.call(this,path,...wrapped);
};

console.log('Industrial Platform wallet-balance preload active',JSON.stringify({
  facilitator:FACILITATOR_MODE,
  route:'/wallet-balance',
  coinbaseAlias:COINBASE_ALIAS,
  price:PRICE
}));

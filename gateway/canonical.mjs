import { networkTools } from './network.mjs';
import { marketTools } from './market.mjs';
import { documentTools } from './article.mjs';

function tool(list,name){
  const found=list.find(t=>t.name===name);
  if(!found) throw new Error('Canonical source tool not found: '+name);
  return found;
}

const liveBalance=tool(networkTools,'chain-live-balance');
const gasState=tool(networkTools,'chain-gas-state');
const cryptoPrice=tool(marketTools,'crypto-price');
const cryptoStats=tool(marketTools,'crypto-24h-stats');
const cryptoCandles=tool(marketTools,'crypto-candles');
const markdown=tool(documentTools,'url-to-markdown');

const USDC={
  base:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  ethereum:'0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
};

export function caipToNetwork(chain='eip155:8453'){
  const value=String(chain||'eip155:8453').toLowerCase();
  if(value==='eip155:8453') return 'base';
  if(value==='eip155:1') return 'ethereum';
  throw Object.assign(new Error('chain must be eip155:8453 (Base) or eip155:1 (Ethereum).'),{statusCode:400});
}

function units(raw,decimals){
  const s=String(raw||'0').replace(/^-/,'');
  const negative=String(raw||'0').startsWith('-');
  const padded=s.padStart(decimals+1,'0');
  const whole=padded.slice(0,-decimals)||'0';
  const fraction=padded.slice(-decimals).replace(/0+$/,'');
  const value=Number((negative?'-':'')+whole+(fraction?'.'+fraction:''));
  return Number.isFinite(value)?value:0;
}

export async function canonicalWalletBalance(input={}){
  const address=String(input.address||'').trim();
  const chain=input.chain||'eip155:8453';
  const network=caipToNetwork(chain);
  const row=await liveBalance.run({address,network,tokens:[USDC[network]]});
  const usdc=row.tokens?.[0]?.balance_raw||'0';
  return {
    address:row.address,
    balances:[
      {symbol:'ETH',amount:units(row.native?.balance_wei,18)},
      {symbol:'USDC',amount:units(usdc,6)}
    ]
  };
}

export async function canonicalGasPrice(input={}){
  const chain=input.chain||'eip155:8453';
  const network=caipToNetwork(chain);
  const row=await gasState.run({network});
  return {
    chain,
    base_fee_gwei:units(row.base_fee_per_gas_wei||row.gas_price_wei||'0',9),
    as_of:row.fetched_at||new Date().toISOString()
  };
}

function productId(symbol,quote='USD'){
  const s=String(symbol||'').trim().toUpperCase();
  const q=String(quote||'USD').trim().toUpperCase();
  if(!s) throw Object.assign(new Error('symbol is required.'),{statusCode:400});
  return s.includes('-')?s:(s+'-'+q);
}

function changePct(open,last){
  const a=Number(open),b=Number(last);
  return Number.isFinite(a)&&a!==0&&Number.isFinite(b)
    ? Number((((b-a)/a)*100).toFixed(6))
    : undefined;
}

const intervalSeconds={'1m':60,'5m':300,'15m':900,'1h':3600,'6h':21600,'1d':86400};

export const canonicalTools=[
  {
    name:'canonical-crypto-spot-price',
    route:'/crypto/spot-price',
    price:'$0.001',priceUsd:0.001,
    summary:'Crypto spot price',
    description:'Roundhouse-canonical crypto spot price for recurring trading-agent polling. Input symbol plus optional quote; output symbol, price, quote_currency, 24h change and as_of.',
    tags:['crypto-spot-price','crypto-price','market-data','recurring','trading-agent'],
    inputSchema:{
      type:'object',
      properties:{
        symbol:{type:'string',description:'Token symbol or trading pair, e.g. BTC or BTC-USD.'},
        quote:{type:'string',description:'Quote currency; defaults to USD.'}
      },
      required:['symbol'],additionalProperties:false
    },
    example:{symbol:'BTC',quote:'USD'},
    run:async input=>{
      const id=productId(input.symbol,input.quote);
      const [ticker,stats]=await Promise.all([cryptoPrice.run({product_id:id}),cryptoStats.run({product_id:id})]);
      return {
        symbol:id,
        price:ticker.price,
        quote_currency:id.split('-').pop(),
        change_24h_pct:changePct(stats.open,stats.last),
        as_of:ticker.fetched_at||new Date().toISOString()
      };
    }
  },
  {
    name:'canonical-crypto-ohlcv',
    route:'/crypto/ohlcv',
    price:'$0.005',priceUsd:0.005,
    summary:'Crypto price history',
    description:'Roundhouse-canonical crypto OHLCV series for recurring market-data workflows. Input symbol, interval and optional since; output normalized oldest-first candles.',
    tags:['crypto-ohlcv','candles','market-data','recurring','trading-agent'],
    inputSchema:{
      type:'object',
      properties:{
        symbol:{type:'string',description:'Token symbol or trading pair, e.g. BTC or BTC-USD.'},
        interval:{type:'string',enum:['1m','5m','15m','1h','6h','1d']},
        since:{type:'string',format:'date-time'}
      },
      required:['symbol','interval'],additionalProperties:false
    },
    example:{symbol:'BTC',interval:'1h'},
    run:async input=>{
      const id=productId(input.symbol,'USD');
      const granularity=intervalSeconds[input.interval];
      const end=Math.floor(Date.now()/1000);
      let start;
      if(input.since){
        const parsed=Date.parse(input.since);
        if(!Number.isFinite(parsed)) throw Object.assign(new Error('since must be an ISO 8601 timestamp.'),{statusCode:400});
        start=Math.floor(parsed/1000);
        if(Math.ceil((end-start)/granularity)>300) {
          throw Object.assign(new Error('Requested series exceeds 300 candles; move since forward or use a wider interval.'),{statusCode:400});
        }
      }
      const row=await cryptoCandles.run({product_id:id,granularity,...(start?{start,end}:{limit:100})});
      return {
        symbol:id,
        interval:input.interval,
        candles:(row.candles||[]).map(x=>({t:x.time_iso,o:x.open,h:x.high,l:x.low,c:x.close,v:x.volume}))
      };
    }
  },
  {
    name:'canonical-web-scrape',
    route:'/web/scrape',
    price:'$0.001',priceUsd:0.001,
    summary:'Page to markdown',
    description:'Roundhouse-canonical page-to-Markdown endpoint for recurring agent ingestion. Input url plus optional render_js=false; output url, title, markdown and HTTP status.',
    tags:['web-scrape','page-to-markdown','rag','recurring','agents'],
    inputSchema:{
      type:'object',
      properties:{
        url:{type:'string',format:'uri'},
        render_js:{type:'boolean',default:false}
      },
      required:['url'],additionalProperties:false
    },
    example:{url:'https://example.com/',render_js:false},
    run:async input=>{
      if(input.render_js===true) throw Object.assign(new Error('render_js=true is not supported by this static-page endpoint.'),{statusCode:422});
      const row=await markdown.run({url:input.url,max_chars:100000});
      return {url:row.final_url||row.url,title:row.title||'',markdown:row.markdown,status:row.http_status};
    }
  }
];

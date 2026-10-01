import { runMetadata } from './metadata.mjs';
import { marketTools } from './market.mjs';
import { documentTools } from './article.mjs';
import { networkTools } from './network.mjs';
import { utilityTools } from './utilities.mjs';

function tool(list, name) {
  const found = list.find(t => t.name === name);
  if (!found) throw new Error('Internal tool not found: ' + name);
  return found;
}

const cryptoPrice = tool(marketTools, 'crypto-price');
const cryptoStats = tool(marketTools, 'crypto-24h-stats');
const cryptoBook = tool(marketTools, 'crypto-top-of-book');
const cryptoTrades = tool(marketTools, 'crypto-recent-trades');
const cryptoCandles = tool(marketTools, 'crypto-candles');

const article = tool(documentTools, 'extract-article');
const headers = tool(networkTools, 'http-headers-security');
const robots = tool(networkTools, 'robots-check');
const chunker = tool(utilityTools, 'text-chunk');

const cryptoSchema = {
  type:'object',
  properties:{
    product_id:{type:'string',pattern:'^[A-Za-z0-9]{2,15}-[A-Za-z0-9]{2,15}$'},
    candle_granularity:{type:'integer',enum:[60,300,900,3600,21600,86400]},
    candle_limit:{type:'integer',minimum:5,maximum:300},
    trade_limit:{type:'integer',minimum:1,maximum:100}
  },
  required:['product_id'],
  additionalProperties:false
};

const urlSchema = {
  type:'object',
  properties:{
    url:{type:'string',format:'uri'},
    user_agent:{type:'string',maxLength:200},
    max_text_chars:{type:'integer',minimum:1000,maximum:150000},
    chunk_size:{type:'integer',minimum:100,maximum:10000},
    chunk_overlap:{type:'integer',minimum:0,maximum:5000}
  },
  required:['url'],
  additionalProperties:false
};

function pctChange(open, last) {
  const a=Number(open), b=Number(last);
  return Number.isFinite(a)&&a!==0&&Number.isFinite(b) ? Number((((b-a)/a)*100).toFixed(4)) : null;
}

export const bundleTools = [
  {
    name:'crypto-market-snapshot',
    route:'/crypto/snapshot',
    price:'$0.008',
    priceUsd:0.008,
    description:'One-call realtime crypto market snapshot from Coinbase Exchange: price, bid/ask, 24h open/high/low/volume and percent change, top-of-book spread, recent trades and OHLCV candles. Built for trading agents, financial-data pipelines, market monitoring, research and dashboards.',
    tags:['crypto','market-data','snapshot','dashboard','trading','ohlcv','order-book','trades','coinbase','agents'],
    inputSchema:cryptoSchema,
    example:{product_id:'BTC-USD',candle_granularity:3600,candle_limit:24,trade_limit:20},
    run:async input=>{
      const base={product_id:input.product_id};
      const [ticker,stats,book,trades,candles]=await Promise.all([
        cryptoPrice.run(base),
        cryptoStats.run(base),
        cryptoBook.run(base),
        cryptoTrades.run({...base,limit:input.trade_limit||20}),
        cryptoCandles.run({...base,granularity:input.candle_granularity||3600,limit:input.candle_limit||24})
      ]);
      const bid=book.best_bid?.price??ticker.bid;
      const ask=book.best_ask?.price??ticker.ask;
      const mid=Number.isFinite(bid)&&Number.isFinite(ask)?(bid+ask)/2:null;
      const spread=Number.isFinite(bid)&&Number.isFinite(ask)?ask-bid:null;
      const spreadBps=Number.isFinite(spread)&&Number.isFinite(mid)&&mid!==0?Number((spread/mid*10000).toFixed(4)):null;
      return {
        status:'ready',
        source:'Coinbase Exchange public market data',
        product_id:input.product_id.toUpperCase(),
        fetched_at:new Date().toISOString(),
        market:{
          price:ticker.price,bid:ticker.bid,ask:ticker.ask,
          spread,spread_bps:spreadBps,
          open_24h:stats.open,high_24h:stats.high,low_24h:stats.low,last:stats.last,
          change_24h_percent:pctChange(stats.open,stats.last),
          volume_24h:stats.volume
        },
        top_of_book:{best_bid:book.best_bid,best_ask:book.best_ask,sequence:book.sequence},
        recent_trades:trades.trades,
        candles:{granularity_seconds:candles.granularity_seconds,count:candles.count,rows:candles.candles}
      };
    }
  },
  {
    name:'web-intelligence-dossier',
    route:'/web/dossier',
    price:'$0.008',
    priceUsd:0.008,
    description:'One-call webpage intelligence dossier for AI agents: metadata and structured data, clean article/document text, HTTP/security headers, robots crawl policy, SHA-256 content hash and RAG-ready chunks. Use for web research, document extraction, due diligence, ingestion, monitoring and retrieval pipelines.',
    tags:['web','research','dossier','rag','article','metadata','security','robots','chunks','agents'],
    inputSchema:urlSchema,
    example:{url:'https://example.com/',chunk_size:1200,chunk_overlap:100},
    run:async input=>{
      const url=input.url;
      const [metaResult,articleResult,headerResult,robotsResult]=await Promise.all([
        runMetadata({urls:[url],timeout_seconds:30,concurrency:1}),
        article.run({url,max_text_chars:input.max_text_chars||100000,timeout_seconds:30}).catch(error=>({status:'error',error:String(error?.message||error)})),
        headers.run({url,method:'HEAD'}).catch(error=>({status:'error',error:String(error?.message||error)})),
        robots.run({url,path:new URL(url).pathname||'/',user_agent:input.user_agent||'*'}).catch(error=>({status:'error',error:String(error?.message||error)}))
      ]);
      const meta=metaResult.results?.[0]||null;
      const text=articleResult?.status==='ready'?articleResult.text:'';
      const chunks=text ? await chunker.run({text,size:input.chunk_size||1200,overlap:input.chunk_overlap||100}) : {count:0,chunks:[]};
      return {
        status:'ready',
        url,
        fetched_at:new Date().toISOString(),
        metadata:meta,
        content:articleResult,
        http:headerResult,
        robots:robotsResult,
        rag:{chunk_size:chunks.size||input.chunk_size||1200,overlap:chunks.overlap||input.chunk_overlap||100,count:chunks.count,chunks:chunks.chunks}
      };
    }
  }
];

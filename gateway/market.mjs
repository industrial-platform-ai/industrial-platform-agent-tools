const COINBASE_ORIGIN = 'https://api.exchange.coinbase.com';
const TIMEOUT_MS = 8000;

function productId(input) {
  const value = String(input?.product_id || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{2,15}-[A-Z0-9]{2,15}$/.test(value)) {
    throw Object.assign(new Error('product_id must look like BTC-USD or ETH-USDC.'), { statusCode: 400 });
  }
  return value;
}

async function fetchCoinbase(path) {
  const response = await fetch(COINBASE_ORIGIN + path, {
    method:'GET',
    headers:{
      accept:'application/json',
      'user-agent':'IndustrialPlatform-MarketData/1.0'
    },
    signal:AbortSignal.timeout(TIMEOUT_MS)
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) {
    throw Object.assign(new Error('Coinbase public market endpoint returned HTTP '+response.status), {
      statusCode: 502,
      upstream: body
    });
  }
  return body;
}

const productSchema = {
  type:'object',
  properties:{
    product_id:{
      type:'string',
      pattern:'^[A-Za-z0-9]{2,15}-[A-Za-z0-9]{2,15}$',
      description:'Coinbase Exchange product such as BTC-USD, ETH-USD, SOL-USD or ETH-USDC.'
    }
  },
  required:['product_id'],
  additionalProperties:false
};

export const marketTools = [
  {
    name:'crypto-price',
    route:'/crypto/price',
    price:'$0.001',
    priceUsd:0.001,
    summary:'Crypto price',
    description:'Realtime crypto price from Coinbase Exchange for trading agents and market monitors. Designed for repeated polling; refresh about every 15 seconds during active trading or alerting workflows.',
    tags:['crypto','price','ticker','market-data','bitcoin','ethereum','coinbase','live','recurring','polling','trading-agent'],
    inputSchema:productSchema,
    example:{product_id:'BTC-USD'},
    run:async input=>{
      const id=productId(input);
      const row=await fetchCoinbase('/products/'+encodeURIComponent(id)+'/ticker');
      return {
        source:'Coinbase Exchange',
        product_id:id,
        price:Number(row.price),
        bid:Number(row.bid),
        ask:Number(row.ask),
        size:Number(row.size),
        volume_24h:Number(row.volume),
        trade_id:row.trade_id ?? null,
        time:row.time ?? null,
        fetched_at:new Date().toISOString(),
        repeat_policy:{mode:'scheduled',recommended_after_seconds:15,reason:'Price and bid/ask change continuously during active markets.'},
        next_check:{recommended_after_seconds:15,request:{product_id:id}}
      };
    }
  },
  {
    name:'crypto-24h-stats',
    route:'/crypto/stats',
    price:'$0.001',
    priceUsd:0.001,
    description:'Crypto 24-hour statistics from Coinbase Exchange for autonomous market monitoring. Repeat about every 60 seconds while an active trading or dashboard workflow is running.',
    tags:['crypto','market-data','stats','24h','volume','high','low','coinbase'],
    inputSchema:productSchema,
    example:{product_id:'BTC-USD'},
    run:async input=>{
      const id=productId(input);
      const row=await fetchCoinbase('/products/'+encodeURIComponent(id)+'/stats');
      return {
        source:'Coinbase Exchange',
        product_id:id,
        open:Number(row.open),
        high:Number(row.high),
        low:Number(row.low),
        last:Number(row.last),
        volume:Number(row.volume),
        volume_30day:row.volume_30day!==undefined?Number(row.volume_30day):null,
        fetched_at:new Date().toISOString(),
        repeat_policy:{mode:'scheduled',recommended_after_seconds:60,reason:'24h market statistics evolve continuously.'},
        next_check:{recommended_after_seconds:60,request:{product_id:id}}
      };
    }
  },
  {
    name:'crypto-top-of-book',
    route:'/crypto/book',
    price:'$0.001',
    priceUsd:0.001,
    description:'Realtime crypto top-of-book data for autonomous execution: best bid, best ask, sizes and sequence. Designed for repeated pre-execution polling; refresh about every 10 seconds during active trading.',
    tags:['crypto','order-book','bid','ask','market-data','coinbase','live','recurring','polling','execution-context'],
    inputSchema:productSchema,
    example:{product_id:'BTC-USD'},
    run:async input=>{
      const id=productId(input);
      const row=await fetchCoinbase('/products/'+encodeURIComponent(id)+'/book?level=1');
      const bid=Array.isArray(row.bids)&&row.bids[0]?row.bids[0]:null;
      const ask=Array.isArray(row.asks)&&row.asks[0]?row.asks[0]:null;
      return {
        source:'Coinbase Exchange',
        product_id:id,
        sequence:row.sequence ?? null,
        best_bid:bid?{price:Number(bid[0]),size:Number(bid[1]),orders:Number(bid[2])}:null,
        best_ask:ask?{price:Number(ask[0]),size:Number(ask[1]),orders:Number(ask[2])}:null,
        fetched_at:new Date().toISOString(),
        repeat_policy:{mode:'scheduled',recommended_after_seconds:10,reason:'Best bid/ask and spread can change every block or trade.'},
        next_check:{recommended_after_seconds:10,request:{product_id:id}}
      };
    }
  },
  {
    name:'crypto-candles',
    route:'/crypto/candles',
    price:'$0.005',
    priceUsd:0.005,
    description:'Crypto OHLCV candles for autonomous trading and indicator pipelines. Supports 1m–1d bars and is designed for recurring refresh; poll again when the selected candle interval advances.',
    tags:['crypto','history','candles','ohlcv','market-data','coinbase','trading','timeseries','recurring','polling'],
    inputSchema:{
      type:'object',
      properties:{
        product_id:productSchema.properties.product_id,
        granularity:{type:'integer',enum:[60,300,900,3600,21600,86400],description:'Candle width in seconds.'},
        start:{type:'integer',minimum:0,description:'Optional Unix start timestamp in seconds.'},
        end:{type:'integer',minimum:0,description:'Optional Unix end timestamp in seconds.'},
        limit:{type:'integer',minimum:1,maximum:300,description:'When start/end are omitted, target this many recent bars; default 100.'}
      },
      required:['product_id'],
      additionalProperties:false
    },
    example:{product_id:'BTC-USD',granularity:3600,limit:48},
    run:async input=>{
      const id=productId(input);
      const granularity=[60,300,900,3600,21600,86400].includes(input?.granularity)?input.granularity:3600;
      const limit=Number.isInteger(input?.limit)?Math.min(300,Math.max(1,input.limit)):100;
      let end=Number.isInteger(input?.end)?input.end:Math.floor(Date.now()/1000);
      let start=Number.isInteger(input?.start)?input.start:end-granularity*limit;
      if(start>=end) throw Object.assign(new Error('start must be earlier than end.'),{statusCode:400});
      const estimated=Math.ceil((end-start)/granularity);
      if(estimated>300) throw Object.assign(new Error('Requested range exceeds 300 candles; shorten the range or increase granularity.'),{statusCode:400});
      const qs=new URLSearchParams({granularity:String(granularity),start:new Date(start*1000).toISOString(),end:new Date(end*1000).toISOString()});
      const rows=await fetchCoinbase('/products/'+encodeURIComponent(id)+'/candles?'+qs.toString());
      const candles=(Array.isArray(rows)?rows:[]).map(row=>({
        time:Number(row[0]),
        time_iso:new Date(Number(row[0])*1000).toISOString(),
        low:Number(row[1]),
        high:Number(row[2]),
        open:Number(row[3]),
        close:Number(row[4]),
        volume:Number(row[5])
      })).sort((a,b)=>a.time-b.time);
      return {
        source:'Coinbase Exchange',product_id:id,granularity_seconds:granularity,start,end,count:candles.length,candles,
        fetched_at:new Date().toISOString(),
        repeat_policy:{mode:'scheduled',recommended_after_seconds:granularity,reason:'Refresh when the selected OHLCV candle interval advances.'},
        next_check:{recommended_after_seconds:granularity,request:{product_id:id,granularity,limit}}
      };
    }
  },
  {
    name:'crypto-recent-trades',
    route:'/crypto/trades',
    price:'$0.001',
    priceUsd:0.001,
    description:'Fetch recent crypto trades from Coinbase Exchange for a trading pair, including trade id, price, size, side and timestamp. Use for tape analysis, market monitoring and trading-agent context.',
    tags:['crypto','trades','ticks','market-data','coinbase','order-flow','live'],
    inputSchema:{
      type:'object',
      properties:{
        product_id:productSchema.properties.product_id,
        limit:{type:'integer',minimum:1,maximum:100,description:'Maximum trades to return; default 50.'}
      },
      required:['product_id'],
      additionalProperties:false
    },
    example:{product_id:'BTC-USD',limit:50},
    run:async input=>{
      const id=productId(input);
      const limit=Number.isInteger(input?.limit)?Math.min(100,Math.max(1,input.limit)):50;
      const rows=await fetchCoinbase('/products/'+encodeURIComponent(id)+'/trades?limit='+limit);
      const trades=(Array.isArray(rows)?rows:[]).slice(0,limit).map(row=>({
        trade_id:row.trade_id ?? null,
        price:Number(row.price),
        size:Number(row.size),
        side:row.side ?? null,
        time:row.time ?? null
      }));
      return {source:'Coinbase Exchange',product_id:id,count:trades.length,trades,fetched_at:new Date().toISOString()};
    }
  }
];

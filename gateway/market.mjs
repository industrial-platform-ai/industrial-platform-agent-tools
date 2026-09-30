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
    price:'$0.0005',
    priceUsd:0.0005,
    description:'Get the current Coinbase Exchange spot ticker for a crypto trading pair: price, bid, ask, size, 24h volume, trade id and timestamp. Public market data; no exchange account required.',
    tags:['crypto','price','ticker','market-data','bitcoin','ethereum','coinbase','live'],
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
        fetched_at:new Date().toISOString()
      };
    }
  },
  {
    name:'crypto-24h-stats',
    route:'/crypto/stats',
    price:'$0.001',
    priceUsd:0.001,
    description:'Get Coinbase Exchange 24-hour statistics for a crypto trading pair, including open, high, low, last price and volume.',
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
        fetched_at:new Date().toISOString()
      };
    }
  },
  {
    name:'crypto-top-of-book',
    route:'/crypto/book',
    price:'$0.001',
    priceUsd:0.001,
    description:'Get the current Coinbase Exchange level-1 order book for a crypto pair: best bid, best ask, sizes and sequence.',
    tags:['crypto','order-book','bid','ask','market-data','coinbase','live'],
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
        fetched_at:new Date().toISOString()
      };
    }
  }
];

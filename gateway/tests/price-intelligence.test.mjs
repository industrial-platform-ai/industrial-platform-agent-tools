import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretPriceMetadata,runPriceIntelligence,buildPriceIntelligenceTools} from '../price-intelligence.mjs';
const url='https://store.example/products/widget';
const metadata=(json_ld=[],extra={})=>({status:'ready',final_url:url,fetched_at:'2026-10-14T12:00:00Z',http_status:200,json_ld,...extra});
test('reads JSON-LD product price and availability',()=>{
  const p=interpretPriceMetadata(metadata([{'@type':'Product',name:'Widget',offers:{'@type':'Offer',price:'19.95',priceCurrency:'USD',availability:'https://schema.org/InStock'}}]),{url});
  assert.equal(p.status,'ready');assert.equal(p.price,'19.95');assert.equal(p.currency,'USD');assert.equal(p.availability,'in_stock');
  assert.equal(p.source,'json_ld[0].offers');assert.equal(p.comparison.status,'baseline');
});
test('reads graph Product with priceSpecification',()=>{
  const p=interpretPriceMetadata(metadata([{'@graph':[{'@type':'WebSite'}, {'@type':'Product',offers:{'@type':'Offer',priceSpecification:{price:'1,299.50',priceCurrency:'usd'},availability:'OutOfStock'}}]}]),{url});
  assert.equal(p.status,'ready');assert.equal(p.price,'1299.50');assert.equal(p.availability,'out_of_stock');
});
test('refuses missing and ambiguous prices and AggregateOffer ranges',()=>{
  assert.equal(interpretPriceMetadata(metadata(),{url}).status,'unavailable');
  assert.equal(interpretPriceMetadata(metadata([{'@type':'Product',offers:[{'@type':'Offer',price:19,priceCurrency:'USD'},{'@type':'Offer',price:29,priceCurrency:'USD'}]}]),{url}).status,'ambiguous');
  assert.equal(interpretPriceMetadata(metadata([{'@type':'Product',offers:{'@type':'AggregateOffer',lowPrice:9,highPrice:19}}]),{url}).status,'ambiguous');
});
test('does not convert an AggregateOffer lowPrice meta fallback into an exact price',()=>{
  const p=interpretPriceMetadata(metadata([{'@type':'Product',offers:{'@type':'AggregateOffer',lowPrice:'19.00',highPrice:'39.00',priceCurrency:'USD'}}],
    {product_metadata:{'price:amount':'19.00','price:currency':'USD',availability:'InStock'}}),{url});
  assert.equal(p.status,'ambiguous');assert.equal(p.price,null);assert.equal(p.currency,null);
  assert.equal(p.comparison.alert_recommended,false);
});
test('does not choose a single offer when another Product offer is aggregate',()=>{
  const p=interpretPriceMetadata(metadata([{'@type':'Product',offers:[{'@type':'Offer',price:'24.00',priceCurrency:'USD'},
    {'@type':'AggregateOffer',lowPrice:'19.00',highPrice:'39.00',priceCurrency:'USD'}]}]),{url});
  assert.equal(p.status,'ambiguous');assert.equal(p.price,null);
});
test('fails closed when one Offer declares conflicting priceSpecification values',()=>{
  const p=interpretPriceMetadata(metadata([{'@type':'Product',offers:{'@type':'Offer',priceSpecification:[
    {price:'100.00',priceCurrency:'USD'},{price:'80.00',priceCurrency:'USD'}]}}]),{url});
  assert.equal(p.status,'ambiguous');assert.equal(p.price,null);
  assert.match(p.reason,/Conflicting price/);
});
test('fails closed when explicit Offer price contradicts its priceSpecification',()=>{
  const p=interpretPriceMetadata(metadata([{'@type':'Product',offers:{'@type':'Offer',price:'99.00',priceCurrency:'USD',
    priceSpecification:{price:'79.00',priceCurrency:'USD'}}}]),{url});
  assert.equal(p.status,'ambiguous');assert.equal(p.price,null);
});
test('fails closed on conflicting currencies but accepts equivalent numeric representations',()=>{
  const bad=interpretPriceMetadata(metadata([{'@type':'Product',offers:{'@type':'Offer',price:'10',priceCurrency:'USD',
    priceSpecification:{price:'10.00',priceCurrency:'EUR'}}}]),{url});
  assert.equal(bad.status,'ambiguous');assert.equal(bad.currency,null);
  const good=interpretPriceMetadata(metadata([{'@type':'Product',offers:{'@type':'Offer',price:'10',priceCurrency:'USD',
    priceSpecification:{price:'10.00',priceCurrency:'USD'}}}]),{url});
  assert.equal(good.status,'ready');assert.equal(good.currency,'USD');assert.equal(good.price,'10');
});
test('uses price meta if JSON-LD missing',()=>{
  const p=interpretPriceMetadata(metadata([],{product_metadata:{'price:amount':'59.00','price:currency':'USD',availability:'InStock'}}),{url});
  assert.equal(p.price,'59.00');assert.equal(p.source,'product_meta');
});
test('price without currency cannot be compared',()=>{
  const p=interpretPriceMetadata(metadata([{'@type':'Product',offers:{'@type':'Offer',price:12}}]),{url});
  assert.equal(p.status,'partial');assert.equal(p.currency,null);
});
test('avoids false change claims when snapshot sources are not comparable',()=>{
  const p=interpretPriceMetadata(metadata(),{url,previous_snapshot:{url,status:'ready',price:'9',currency:'USD'}});
  assert.equal(p.comparison.status,'not_comparable');assert.equal(p.comparison.changed,null);
});
test('detects real price and stock changes; validates same URL',()=>{
  const m=metadata([{'@type':'Product',offers:{'@type':'Offer',price:'12',priceCurrency:'USD',availability:'InStock'}}]);
  const p=interpretPriceMetadata(m,{url,previous_snapshot:{url,status:'ready',price:'15',currency:'USD',availability:'out_of_stock'}});
  assert.deepEqual(p.comparison.changed_fields,['price','availability']);assert.equal(p.comparison.alert_recommended,true);
  assert.throws(()=>interpretPriceMetadata(m,{url,previous_snapshot:{url:'https://other.example',status:'ready'}}),/match requested URL/);
});
test('blocks locale ambiguous price formats',()=>{
  const p=interpretPriceMetadata(metadata([{'@type':'Product',offers:{'@type':'Offer',price:'1.299,95',priceCurrency:'EUR'}}]),{url});
  assert.equal(p.status,'unavailable');
});
test('one paid API call triggers only one existing SSRF-safe metadata fetch',async()=>{
  let n=0;const fetcher=async input=>{n++;assert.deepEqual(input.urls,[url]);return {results:[metadata()]};};
  const r=await runPriceIntelligence({url},{runMetadata:fetcher});assert.equal(r.status,'unavailable');assert.equal(n,1);
  const [tool]=buildPriceIntelligenceTools({runMetadata:fetcher});
  assert.equal(tool.route,'/commerce/price-snapshot');assert.equal(tool.priceUsd,0.005);
});
test('propagates inaccessible page as 502',async()=>{
  await assert.rejects(runPriceIntelligence({url},{runMetadata:async()=>({results:[{status:'error',error:'blocked'}]})}),e=>e.statusCode===502);
});

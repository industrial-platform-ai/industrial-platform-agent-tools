import {createHash} from 'node:crypto';

const fail = (message, statusCode=400) => Object.assign(new Error(message), {statusCode});
const types = v => (Array.isArray(v)?v:[v]).filter(Boolean).map(x=>String(x).split(/[\/#]/).pop().toLowerCase());
const availability = v => {
  const s=String(v||'').toLowerCase().replace(/[^a-z]/g,'');
  if(s.endsWith('outofstock')||s==='soldout'||s==='unavailable')return 'out_of_stock';
  if(s.endsWith('instock')||s==='available')return 'in_stock';
  for(const [name,state] of [['preorder','preorder'],['backorder','backorder'],['discontinued','discontinued']])if(s.endsWith(name))return state;
  return 'unknown';
};
const currency = v => typeof v==='string'&&/^[a-z]{3}$/i.test(v.trim())?v.trim().toUpperCase():null;
function money(v) {
  if(typeof v==='number')return Number.isFinite(v)&&v>=0?String(v):null;
  if(typeof v!=='string')return null;
  const s=v.trim();
  if(!/^\d+(?:\.\d{1,6})?$/.test(s)&& !/^\d{1,3}(?:,\d{3})+(?:\.\d{1,6})?$/.test(s))return null;
  return String(s.replace(/,/g,''));
}
function products(documents) {
  const found=[];let total=0;
  function walk(n,depth=0,path='json_ld') {
    if(++total>500||depth>10||!n||typeof n!=='object')return;
    if(Array.isArray(n)){n.slice(0,50).forEach((x,i)=>walk(x,depth+1,path+'['+i+']'));return;}
    if(types(n['@type']).includes('product'))found.push({node:n,path});
    for(const k of ['@graph','mainEntity','itemListElement','item','hasPart'])if(n[k])walk(n[k],depth+1,path+'.'+k);
  }
  walk(documents);return found.slice(0,30);
}
const objs=v=>(Array.isArray(v)?v:[v]).filter(x=>x&&typeof x==='object').slice(0,25);
function extract(metadata) {
  const choices=[];
  let aggregateOfferPresent=false;
  let contradictoryOfferPresent=false;
  for(const {node,path} of products(metadata.json_ld||[]))for(const offer of objs(node.offers)) {
    if(types(offer['@type']).includes('aggregateoffer')){aggregateOfferPresent=true;continue;}
    const specs=objs(offer.priceSpecification);
    const declaredPrices=[money(offer.price),...specs.map(s=>money(s.price))].filter(x=>x!==null);
    const declaredCurrencies=[currency(offer.priceCurrency),...specs.map(s=>currency(s.priceCurrency))].filter(Boolean);
    // Multiple contradictory structured prices or currencies cannot identify a single current offer.
    if(new Set(declaredPrices.map(Number)).size>1||new Set(declaredCurrencies).size>1){contradictoryOfferPresent=true;continue;}
    const price=declaredPrices[0]??null;
    if(price===null)continue;
    choices.push({price,currency:declaredCurrencies[0]||null,
      availability:availability(offer.availability),product_name:typeof node.name==='string'?node.name.slice(0,250):null,
      source:path+'.offers',evidence_field:'price'});
  }
  if(aggregateOfferPresent||contradictoryOfferPresent)return {status:'ambiguous',price:null,currency:null,
    availability:'unknown',product_name:null,source:null,evidence_field:null,
    candidates_found:choices.length,
    reason:contradictoryOfferPresent?'Conflicting price or currency declarations in one structured Offer.':'AggregateOffer or mixed aggregate/single offers: no unambiguous product-level price.'};
  if(!choices.length) {
    const p=metadata.product_metadata||{},og=metadata.open_graph||{};
    const price=money(p['price:amount']??p.price??og['price:amount']);
    if(price!==null)choices.push({price,currency:currency(p['price:currency']||p.currency||og['price:currency']),
      availability:availability(p.availability),product_name:metadata.title||null,
      source:(p['price:amount']||p.price)?'product_meta':'open_graph',evidence_field:'price:amount'});
  }
  const distinct=new Map(choices.map(c=>[[c.price,c.currency,c.availability].join('|'),c]));
  if(distinct.size!==1)return {status:distinct.size?'ambiguous':'unavailable',price:null,currency:null,
    availability:'unknown',product_name:null,source:null,evidence_field:null,candidates_found:choices.length,
    reason:distinct.size?'Conflicting/variant prices or stock availability.':'No trustworthy single-offer price in server-delivered structured metadata.'};
  const single=[...distinct.values()][0];
  return {status:single.currency?'ready':'partial',...single,candidates_found:choices.length,
    reason:single.currency?null:'Currency unavailable; price comparisons disabled.'};
}
function comparison(previous,current,url) {
  if(previous===undefined)return {status:'baseline',changed:null,changed_fields:[],alert_recommended:false};
  if(!previous||typeof previous!=='object'||Array.isArray(previous))throw fail('previous_snapshot must be an object.');
  const normalize=v=>{try{return new URL(v).href;}catch{return null;}};
  if(normalize(previous.url)!==normalize(url))throw fail('previous_snapshot.url must match requested URL.');
  if(previous.status!=='ready'||current.status!=='ready')return {status:'not_comparable',changed:null,changed_fields:[],alert_recommended:false};
  if(money(previous.price)===null||!currency(previous.currency))throw fail('Invalid previous_snapshot price or currency.');
  if(currency(previous.currency)!==current.currency)return {status:'not_comparable',changed:null,changed_fields:[],alert_recommended:false};
  const fields=[];
  if(Number(previous.price)!==Number(current.price))fields.push('price');
  if(previous.availability&&previous.availability!=='unknown'&&current.availability!=='unknown'&&previous.availability!==current.availability)fields.push('availability');
  return {status:'compared',changed:fields.length>0,changed_fields:fields,alert_recommended:fields.length>0};
}
export function interpretPriceMetadata(metadata,{url,previous_snapshot}={}) {
  let canonical;
  try{canonical=new URL(url);if(!['http:','https:'].includes(canonical.protocol))throw Error('protocol');}
  catch{throw fail('Provide one public http(s) product URL.');}
  if(metadata?.status!=='ready')throw fail('Metadata unavailable.',502);
  const observed=extract(metadata),reference=canonical.href;
  const observation_hash=createHash('sha256').update(JSON.stringify({url:reference,price:observed.price,currency:observed.currency,availability:observed.availability})).digest('hex');
  return {status:observed.status,url:reference,final_url:metadata.final_url||reference,checked_at:metadata.fetched_at||new Date().toISOString(),
    http_status:metadata.http_status??null,title:metadata.title||null,price:observed.price,currency:observed.currency,
    availability:observed.availability,product_name:observed.product_name,source:observed.source,evidence_field:observed.evidence_field,
    candidates_found:observed.candidates_found,reason:observed.reason,observation_hash,
    comparison:comparison(previous_snapshot,observed,reference),
    data_quality_note:'Server-delivered structured metadata only. Prices rendered by JavaScript, variant prices, coupons, tax and shipping may be missing. Verify before acting.',
    request_scope:'Single caller-specified public product URL; no automated continuous monitoring, login or purchasing.'};
}
export async function runPriceIntelligence(input,{runMetadata}={}) {
  if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.url!=='string'||input.url.length>2048)throw fail('url must be one public product URL <= 2048 characters.');
  if(typeof runMetadata!=='function')throw Error('Missing metadata handler.');
  const out=await runMetadata({urls:[input.url],timeout_seconds:15});
  const m=out?.results?.[0];
  if(m?.status!=='ready')throw fail('Unable to fetch product metadata: '+String(m?.error||'unknown').slice(0,180),502);
  return interpretPriceMetadata(m,input);
}
export function buildPriceIntelligenceTools({runMetadata}={}) {
  if(typeof runMetadata!=='function')throw Error('Missing metadata handler.');
  return [{name:'product-price-intelligence',route:'/commerce/price-snapshot',price:'$0.005',priceUsd:0.005,
    description:'Extract a server-declared product price, currency and stock availability from a single public product page. Optionally compare against a caller-owned previous snapshot. Unknown and ambiguous prices are reported instead of invented. No unattended polling or ordering.',
    tags:['ecommerce','competitor-price-monitoring','product-prices','pricing-intelligence','stock-availability','agents'],
    inputSchema:{type:'object',additionalProperties:false,properties:{url:{type:'string',format:'uri',maxLength:2048},
      previous_snapshot:{type:'object',additionalProperties:false,properties:{url:{type:'string',format:'uri'},status:{type:'string',enum:['ready','partial','unavailable','ambiguous']},
        price:{type:['string','null']},currency:{type:['string','null']},availability:{type:'string'}},required:['url','status']}},
      required:['url']},example:{url:'https://example.com/'},run:input=>runPriceIntelligence(input,{runMetadata})}];
}

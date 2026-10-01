import { Actor, log } from 'apify';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { XMLParser } from 'fast-xml-parser';
import googleTrends from 'google-trends-api';
import { Innertube } from 'youtubei.js';

const MODE = process.env.PRODUCT_MODE || 'web-content';
const MAX_ITEMS = 100;
const USER_AGENT = 'Mozilla/5.0 (compatible; IndustrialPlatformBot/1.0; +https://apify.com/industrial_platform)';

function clean(s='') {
  return String(s).replace(/\u00a0/g,' ').replace(/[\t ]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
}
function uniq(xs){ return [...new Set(xs.filter(Boolean))]; }
function asArray(v){ return Array.isArray(v)?v:[]; }
function normalizeUrl(v){
  try { const u=new URL(String(v)); if(!/^https?:$/.test(u.protocol)) throw new Error(); return u.href; }
  catch { throw new Error('Invalid public HTTP/HTTPS URL: '+v); }
}
async function fetchText(url,{timeout=30000,headers={}}={}){
  const r=await fetch(url,{headers:{'user-agent':USER_AGENT,'accept':'text/html,application/xhtml+xml,application/json,application/xml,text/xml,text/plain,*/*;q=0.8',...headers},redirect:'follow',signal:AbortSignal.timeout(timeout)});
  const text=await r.text();
  if(!r.ok) throw new Error('HTTP '+r.status+' for '+url);
  return {text,finalUrl:r.url,status:r.status,contentType:r.headers.get('content-type')||''};
}
function htmlDoc(html,url){
  const $=cheerio.load(html);
  $('script,style,noscript,template,svg,canvas,iframe').remove();
  const title=clean($('title').first().text())||null;
  const canonicalRaw=$('link[rel="canonical"]').attr('href');
  let canonical=canonicalRaw||url;
  try{canonical=new URL(canonicalRaw||url,url).href;}catch{}
  const description=$('meta[name="description"]').attr('content')||$('meta[property="og:description"]').attr('content')||null;
  const author=$('meta[name="author"]').attr('content')||$('[rel="author"]').first().text()||null;
  const published=$('meta[property="article:published_time"]').attr('content')||$('time[datetime]').first().attr('datetime')||null;
  const headings=[];
  $('h1,h2,h3').each((_,el)=>{const t=clean($(el).text());if(t)headings.push({level:el.tagName,text:t});});
  const links=[];
  $('a[href]').each((_,el)=>{
    if(links.length>=1000)return;
    const href=$(el).attr('href'); if(!href)return;
    try{links.push({url:new URL(href,url).href,text:clean($(el).text()).slice(0,300)});}catch{}
  });
  const jsonLd=[];
  $('script[type="application/ld+json"]').each((_,el)=>{try{jsonLd.push(JSON.parse($(el).text()));}catch{}});
  const bodyHtml=$('article').first().html()||$('main').first().html()||$('body').html()||html;
  const td=new TurndownService({headingStyle:'atx',bulletListMarker:'-'});
  const markdown=clean(td.turndown(bodyHtml));
  const text=clean($('article').first().text()||$('main').first().text()||$('body').text()||$.root().text());
  return {title,canonical,description,author:clean(author)||null,published,headings,links,json_ld:jsonLd,text,markdown};
}
function findProduct(node){
  if(Array.isArray(node)){for(const x of node){const y=findProduct(x);if(y)return y;}return null;}
  if(!node||typeof node!=='object')return null;
  const t=node['@type'];
  if(t==='Product'||(Array.isArray(t)&&t.includes('Product')))return node;
  if(node['@graph'])return findProduct(node['@graph']);
  for(const v of Object.values(node)){const y=findProduct(v);if(y)return y;}
  return null;
}
function itemList(input,key){
  const arr=uniq(asArray(input[key]).map(x=>typeof x==='string'?x.trim():'').filter(Boolean));
  if(!arr.length)throw new Error(key+' must contain at least one item.');
  if(arr.length>MAX_ITEMS)throw new Error('Maximum '+MAX_ITEMS+' items per run.');
  return arr;
}
async function youtube(){
  return await Innertube.create({generate_session_locally:true,retrieve_player:false});
}
let ytPromise;
function getYT(){ ytPromise ||= youtube(); return ytPromise; }

async function processOne(value,input){
  if(MODE==='web-content'||MODE==='url-markdown'||MODE==='article'||MODE==='ecommerce'){
    const url=normalizeUrl(value);
    const f=await fetchText(url,{timeout:(input.timeout_seconds||30)*1000});
    const d=htmlDoc(f.text,f.finalUrl);
    if(MODE==='web-content') return {status:'ready',url,final_url:f.finalUrl,http_status:f.status,title:d.title,description:d.description,canonical:d.canonical,text:d.text.slice(0,input.max_chars||120000),markdown:d.markdown.slice(0,input.max_chars||120000),headings:d.headings,links:d.links};
    if(MODE==='url-markdown') return {status:'ready',url,final_url:f.finalUrl,title:d.title,canonical:d.canonical,markdown:d.markdown.slice(0,input.max_chars||120000),text:d.text.slice(0,input.max_chars||120000)};
    if(MODE==='article') return {status:'ready',url,final_url:f.finalUrl,title:d.title,author:d.author,published:d.published,description:d.description,canonical:d.canonical,text:d.text.slice(0,input.max_chars||160000),markdown:d.markdown.slice(0,input.max_chars||160000),json_ld:d.json_ld};
    const p=findProduct(d.json_ld);
    const offers=p?.offers;
    const offer=Array.isArray(offers)?offers[0]:offers;
    return {status:'ready',url,final_url:f.finalUrl,name:p?.name||d.title,description:p?.description||d.description,sku:p?.sku||p?.mpn||null,brand:typeof p?.brand==='string'?p.brand:p?.brand?.name||null,price:offer?.price??offer?.lowPrice??null,currency:offer?.priceCurrency||null,availability:offer?.availability||null,images:uniq(Array.isArray(p?.image)?p.image:[p?.image]).filter(Boolean),canonical:d.canonical,json_ld:p||null};
  }

  if(MODE==='google-news'){
    const q=encodeURIComponent(value);
    const f=await fetchText('https://news.google.com/rss/search?q='+q+'&hl=en-US&gl=US&ceid=US:en');
    const xml=new XMLParser({ignoreAttributes:false}).parse(f.text);
    const items=asArray(xml?.rss?.channel?.item).slice(0,input.max_results||25).map(x=>({title:x.title||null,url:x.link||null,published:x.pubDate||null,publisher:x.source?.['#text']||x.source||null}));
    return {status:'ready',query:value,count:items.length,results:items};
  }

  if(MODE==='google-trends'){
    const startTime=new Date(Date.now()-((input.days||90)*86400000));
    const raw=await googleTrends.interestOverTime({keyword:value,startTime,geo:input.geo||'US'});
    const parsed=JSON.parse(raw);
    const timeline=parsed?.default?.timelineData||[];
    return {status:'ready',query:value,geo:input.geo||'US',days:input.days||90,timeline:timeline.map(x=>({time:x.time,formatted_time:x.formattedTime,value:x.value?.[0]??null}))};
  }

  if(MODE.startsWith('youtube-')){
    const yt=await getYT();
    if(MODE==='youtube-search'){
      const s=await yt.search(value,{type:'video'});
      const results=(s.videos||[]).slice(0,input.max_results||20).map(v=>({id:v.id,title:v.title?.text||v.title||null,url:v.id?'https://www.youtube.com/watch?v='+v.id:null,channel:v.author?.name||null,views:v.view_count?.text||null,duration:v.duration?.text||null,published:v.published?.text||null}));
      return {status:'ready',query:value,count:results.length,results};
    }
    const id=String(value).match(/(?:v=|youtu\.be\/|shorts\/)?([\w-]{11})/)?.[1]||String(value).trim();
    if(MODE==='youtube-channel'){
      let channel;
      if(/^UC[\w-]{22}$/.test(id)) channel=await yt.getChannel(id);
      else {
        const search=await yt.search(value,{type:'channel'});
        const first=search.channels?.[0]; if(!first)throw new Error('Channel not found');
        channel=await yt.getChannel(first.id);
      }
      const info=channel.metadata||channel;
      return {status:'ready',input:value,id:info.id||null,title:info.title||null,description:info.description||null,subscriber_count:info.subscriber_count||null,view_count:info.view_count||null,video_count:info.video_count||null,vanity_channel_url:info.vanity_channel_url||null};
    }
    const info=await yt.getInfo(id);
    const basic=info.basic_info||{};
    if(MODE==='youtube-video') return {status:'ready',input:value,id:basic.id||id,title:basic.title||null,channel_id:basic.channel_id||null,author:basic.author||null,short_description:basic.short_description||null,duration:basic.duration||null,view_count:basic.view_count||null,like_count:basic.like_count||null,is_live:basic.is_live||false,thumbnail:basic.thumbnail?.[0]?.url||null};
    if(MODE==='youtube-transcript'){
      const t=await info.getTranscript();
      const body=t?.transcript?.content?.body;
      const segs=(body?.initial_segments||body?.segments||[]).map(s=>({text:s.snippet?.text||s.text||'',start_ms:s.start_ms||null,end_ms:s.end_ms||null})).filter(x=>x.text);
      return {status:'ready',input:value,id:basic.id||id,title:basic.title||null,language:t?.transcript?.content?.language_code||null,text:segs.map(x=>x.text).join(' '),segments:segs};
    }
    if(MODE==='youtube-comments'){
      const comments=await info.getComments();
      const arr=(comments.contents||comments.comments||[]).slice(0,input.max_results||100).map(c=>({id:c.comment_id||c.id||null,text:c.content?.text||c.content||null,author:c.author?.name||null,likes:c.vote_count||null,published:c.published_time||null,reply_count:c.reply_count||0}));
      return {status:'ready',input:value,id:basic.id||id,count:arr.length,comments:arr};
    }
  }

  if(MODE==='google-search'){
    const f=await fetchText('https://www.google.com/search?q='+encodeURIComponent(value)+'&num='+(input.max_results||10),{headers:{'accept-language':input.language||'en-US,en;q=0.9'}});
    const $=cheerio.load(f.text);
    const results=[];
    $('div.MjjYud, div.tF2Cxc').each((_,el)=>{
      if(results.length>=(input.max_results||10))return;
      const a=$(el).find('a').first(), href=a.attr('href'), title=clean($(el).find('h3').first().text());
      const snippet=clean($(el).find('.VwiC3b,.aCOpRe').first().text());
      if(href&&title&&/^https?:/.test(href))results.push({position:results.length+1,title,url:href,snippet});
    });
    if(!results.length)throw new Error('Google returned no parseable organic results; not billed.');
    return {status:'ready',query:value,count:results.length,results};
  }

  if(MODE==='reddit'){
    const isUrl=/^https?:\/\//.test(value);
    const url=isUrl?value.replace(/\/$/,'')+'.json':'https://www.reddit.com/search.json?q='+encodeURIComponent(value)+'&limit='+(input.max_results||25)+'&raw_json=1';
    const f=await fetchText(url,{headers:{accept:'application/json'}});
    const j=JSON.parse(f.text);
    const children=j?.data?.children||j?.[0]?.data?.children||[];
    const results=children.slice(0,input.max_results||25).map(x=>{const d=x.data||{};return {id:d.id,title:d.title||null,subreddit:d.subreddit||null,author:d.author||null,score:d.score||0,num_comments:d.num_comments||0,url:d.url_overridden_by_dest||d.url||null,permalink:d.permalink?'https://www.reddit.com'+d.permalink:null,selftext:d.selftext||null,created_utc:d.created_utc||null};});
    if(!results.length)throw new Error('Reddit returned no parseable results; not billed.');
    return {status:'ready',input:value,count:results.length,results};
  }

  throw new Error('Unsupported PRODUCT_MODE '+MODE);
}

await Actor.main(async()=>{
  const input=(await Actor.getInput())||{};
  const key=MODE.startsWith('youtube-')?(MODE==='youtube-search'?'queries':MODE==='youtube-channel'?'channels':'videos'):(MODE==='google-news'||MODE==='google-trends'||MODE==='google-search'?'queries':MODE==='reddit'?'inputs':'urls');
  const values=itemList(input,key);
  const pricing=Actor.getChargingManager().getPricingInfo();
  const event=process.env.PRODUCT_EVENT||'result';
  const results=[];
  for(const value of values){
    try{
      const result={...(await processOne(value,input)),fetched_at:new Date().toISOString()};
      if(pricing.isPayPerEvent){
        const charge=await Actor.pushData(result,event);
        if(charge?.eventChargeLimitReached){results.push({status:'charge_limit_reached',input:value});continue;}
      } else await Actor.pushData(result);
      results.push(result);
    }catch(error){
      const row={status:'error',input:value,error:error instanceof Error?error.message:String(error),fetched_at:new Date().toISOString()};
      await Actor.pushData(row);
      results.push(row);
    }
  }
  const summary={status:'ready',mode:MODE,requested:values.length,succeeded:results.filter(x=>x.status==='ready').length,failed:results.filter(x=>x.status==='error').length};
  await Actor.setValue('OUTPUT',{summary,results});
  log.info('Demand product complete',summary);
});

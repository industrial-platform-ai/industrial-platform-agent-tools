import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import * as cheerio from 'cheerio';
import { diffLines } from 'diff';
import ipaddr from 'ipaddr.js';

const DEFAULT_MAX_TEXT_CHARS = 100_000;
const HARD_MAX_TEXT_CHARS = 250_000;
const DEFAULT_MAX_DIFF_CHARS = 12_000;
const HARD_MAX_DIFF_CHARS = 50_000;
const MAX_RESPONSE_BYTES = 5_000_000;
const MAX_REDIRECTS = 5;
const BLOCKED_HOST_SUFFIXES = ['.localhost','.local','.internal','.home','.lan'];
const BLOCK_TAGS = ['address','article','aside','blockquote','dd','div','dl','dt','fieldset','figcaption','figure','footer','form','h1','h2','h3','h4','h5','h6','header','hr','li','main','nav','ol','p','pre','section','table','tbody','td','tfoot','th','thead','tr','ul'];

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}
function normalizeText(value) {
  return String(value ?? '').replace(/\u00a0/g,' ').replace(/\r\n?/g,'\n').split('\n')
    .map(line=>line.replace(/[\t\f\v ]+/g,' ').trim()).filter(Boolean).join('\n').trim();
}
function canonicalizeJsonValue(value) {
  if (Array.isArray(value)) return value.map(canonicalizeJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonicalizeJsonValue(value[k])]));
  }
  return value;
}
function canonicalizeJson(text) { return JSON.stringify(canonicalizeJsonValue(JSON.parse(text)), null, 2); }
function truncateText(value,maxChars) {
  return value.length<=maxChars ? {text:value,truncated:false} : {text:value.slice(0,maxChars),truncated:true};
}
function extractNormalizedContent({body,contentType='',selector,ignoreSelectors=[],maxTextChars=DEFAULT_MAX_TEXT_CHARS}) {
  const normalizedType=String(contentType).toLowerCase();
  let title; let text;
  if (normalizedType.includes('application/json')||normalizedType.includes('+json')||(!normalizedType&&/^[\s\n\r]*[\[{]/.test(body))) {
    try { text=canonicalizeJson(body); } catch { text=normalizeText(body); }
  } else if (normalizedType.includes('text/html')||normalizedType.includes('application/xhtml+xml')||normalizedType.includes('xml')||(!normalizedType&&/^[\s\n\r]*</.test(body))) {
    const xmlMode=normalizedType.includes('xml')&&!normalizedType.includes('xhtml');
    const $=cheerio.load(body,{xmlMode});
    $('script, style, noscript, template, svg, canvas, iframe').remove();
    for (const ignoredSelector of ignoreSelectors) {
      try { $(ignoredSelector).remove(); } catch (e) { throw new Error(`Invalid ignore selector "${ignoredSelector}": ${e.message}`); }
    }
    if (!xmlMode) {
      title=normalizeText($('title').first().text())||undefined;
      $('br').replaceWith('\n');
      $(BLOCK_TAGS.join(',')).each((_,el)=>$(el).append('\n'));
    }
    let selected;
    if (selector) {
      try { selected=$(selector); } catch (e) { throw new Error(`Invalid selector "${selector}": ${e.message}`); }
      if (selected.length===0) throw new Error(`Selector "${selector}" did not match any content.`);
    } else selected=xmlMode?$.root():($('body').length?$('body'):$.root());
    text=normalizeText(selected.text());
  } else if (normalizedType.startsWith('text/')||normalizedType.includes('javascript')||normalizedType.includes('graphql')||normalizedType.includes('yaml')||normalizedType.includes('csv')||!normalizedType) {
    text=normalizeText(body);
  } else throw new Error(`Unsupported content type: ${contentType||'unknown'}.`);
  const originalTextLength=text.length;
  const truncated=truncateText(text,maxTextChars);
  return {title,text:truncated.text,textTruncated:truncated.truncated,originalTextLength};
}
function hashContent(text){return createHash('sha256').update(text,'utf8').digest('hex');}
function truncateDiff(value,maxChars){return value.length<=maxChars?value:`${value.slice(0,Math.max(0,maxChars-16))}\n...[truncated]`;}
function compareText(previousText,currentText,maxDiffChars=DEFAULT_MAX_DIFF_CHARS){
  const parts=diffLines(previousText,currentText);
  let addedChars=0,removedChars=0,unchangedChars=0,addedBlocks=0,removedBlocks=0; const added=[],removed=[];
  for(const part of parts){
    if(part.added){addedChars+=part.value.length;addedBlocks++;added.push(part.value.trim());}
    else if(part.removed){removedChars+=part.value.length;removedBlocks++;removed.push(part.value.trim());}
    else unchangedChars+=part.value.length;
  }
  const denominator=unchangedChars*2+addedChars+removedChars;
  return {added_chars:addedChars,removed_chars:removedChars,added_blocks:addedBlocks,removed_blocks:removedBlocks,
    change_ratio:Number((denominator===0?0:(addedChars+removedChars)/denominator).toFixed(6)),
    added_excerpt:truncateDiff(added.filter(Boolean).join('\n'),maxDiffChars),
    removed_excerpt:truncateDiff(removed.filter(Boolean).join('\n'),maxDiffChars)};
}
function isPublicIpAddress(address){try{return ipaddr.process(address).range()==='unicast';}catch{return false;}}
function isBlockedHostname(hostname){const n=hostname.toLowerCase().replace(/\.$/,'');return !n||n==='localhost'||BLOCKED_HOST_SUFFIXES.some(s=>n.endsWith(s));}
async function validatePublicUrl(rawUrl){
  let parsed; try{parsed=new URL(rawUrl);}catch{throw new Error('URL is invalid.');}
  if(!['http:','https:'].includes(parsed.protocol))throw new Error('Only http:// and https:// URLs are supported.');
  if(parsed.username||parsed.password)throw new Error('URLs containing embedded credentials are not allowed.');
  if(isBlockedHostname(parsed.hostname))throw new Error('Local or private hostnames are not allowed.');
  if(net.isIP(parsed.hostname)){if(!isPublicIpAddress(parsed.hostname))throw new Error('Private or reserved IP addresses are not allowed.');return parsed;}
  const records=await lookup(parsed.hostname,{all:true,verbatim:true});
  if(!records.length)throw new Error('Hostname did not resolve.');
  for(const record of records)if(!isPublicIpAddress(record.address))throw new Error('Hostname resolves to a non-public IP address.');
  return parsed;
}
async function readBodyWithLimit(response,maxBytes){
  const declared=Number(response.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>maxBytes)throw new Error(`Response is too large (${declared} bytes; limit ${maxBytes}).`);
  if(!response.body)return{body:'',bytes:0};
  const reader=response.body.getReader(); const chunks=[]; let total=0;
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes){await reader.cancel();throw new Error(`Response exceeded the ${maxBytes}-byte limit.`);}chunks.push(Buffer.from(value));}
  const buffer=Buffer.concat(chunks,total);return{body:new TextDecoder('utf-8',{fatal:false}).decode(buffer),bytes:total};
}
async function fetchPublicText(rawUrl,{timeoutSeconds=30,maxBytes=MAX_RESPONSE_BYTES,maxRedirects=MAX_REDIRECTS}={}){
  let currentUrl=rawUrl; const startedAt=Date.now();
  for(let redirectCount=0;redirectCount<=maxRedirects;redirectCount++){
    const validated=await validatePublicUrl(currentUrl);
    const response=await fetch(validated,{method:'GET',redirect:'manual',headers:{Accept:'text/html,application/xhtml+xml,application/json,text/plain,application/xml,text/xml;q=0.9,*/*;q=0.5','User-Agent':'IndustrialPlatform-WebChangeIntelligence/1.0'},signal:AbortSignal.timeout(timeoutSeconds*1000)});
    if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');if(!location)throw new Error(`HTTP ${response.status} redirect missing Location header.`);if(redirectCount>=maxRedirects)throw new Error('Too many redirects.');currentUrl=new URL(location,validated).href;continue;}
    if(!response.ok)throw new Error(`Target returned HTTP ${response.status} ${response.statusText}.`);
    const contentType=response.headers.get('content-type')??''; const {body,bytes}=await readBodyWithLimit(response,maxBytes);
    return{body,bytes,contentType,httpStatus:response.status,finalUrl:validated.href,durationMs:Date.now()-startedAt};
  }
  throw new Error('Too many redirects.');
}

export async function runChange(input={}){
  const url=typeof input.url==='string'?input.url.trim():'';
  if(!url)throw Object.assign(new Error('url is required.'),{statusCode:400});
  const previousText=typeof input.previous_text==='string'?input.previous_text:undefined;
  const previousHash=typeof input.previous_hash==='string'&&input.previous_hash.trim()?input.previous_hash.trim().toLowerCase():undefined;
  if(previousHash&&!/^[a-f0-9]{64}$/i.test(previousHash))throw Object.assign(new Error('previous_hash must be a 64-character SHA-256 hex digest.'),{statusCode:400});
  if(previousText&&previousHash&&hashContent(previousText).toLowerCase()!==previousHash)throw Object.assign(new Error('previous_text does not match previous_hash.'),{statusCode:400});
  const selector=typeof input.selector==='string'&&input.selector.trim()?input.selector.trim():undefined;
  const ignoreSelectors=Array.isArray(input.ignore_selectors)?input.ignore_selectors.filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim()):[];
  const includeCurrentText=input.include_current_text!==false;
  const maxTextChars=clampInteger(input.max_text_chars,DEFAULT_MAX_TEXT_CHARS,1000,HARD_MAX_TEXT_CHARS);
  const maxDiffChars=clampInteger(input.max_diff_chars,DEFAULT_MAX_DIFF_CHARS,1000,HARD_MAX_DIFF_CHARS);
  const timeoutSeconds=clampInteger(input.timeout_seconds,30,5,60);
  const fetched=await fetchPublicText(url,{timeoutSeconds});
  const extracted=extractNormalizedContent({body:fetched.body,contentType:fetched.contentType,selector,ignoreSelectors,maxTextChars});
  const currentHash=hashContent(extracted.text);
  let comparisonMode='baseline',comparisonStatus='baseline',changed,diff;
  if(previousText!==undefined){comparisonMode='text';changed=previousText!==extracted.text;comparisonStatus=changed?'changed':'unchanged';if(changed)diff=compareText(previousText,extracted.text,maxDiffChars);}
  else if(previousHash){comparisonMode='hash';changed=previousHash!==currentHash;comparisonStatus=changed?'changed':'unchanged';}
  return JSON.parse(JSON.stringify({
    status:'ready',url,final_url:fetched.finalUrl,checked_at:new Date().toISOString(),http_status:fetched.httpStatus,
    content_type:fetched.contentType||undefined,title:extracted.title,selector,ignore_selectors:ignoreSelectors.length?ignoreSelectors:undefined,
    comparison_mode:comparisonMode,comparison_status:comparisonStatus,...(changed===undefined?{}:{changed}),
    previous_hash:previousHash,current_hash:currentHash,text_length:extracted.text.length,original_text_length:extracted.originalTextLength,
    text_truncated:extracted.textTruncated,current_text:includeCurrentText?extracted.text:undefined,diff,
    repeat_policy:{
      mode:'scheduled',
      recommended_after_seconds:300,
      reason:'Website content, prices, inventory, availability and policies change over time; repeat this check on a five-minute cadence while monitoring is active.'
    },
    next_check:{
      recommended_after_seconds:300,
      previous_hash:currentHash,
      request:{
        url,
        previous_hash:currentHash,
        selector,
        ignore_selectors:ignoreSelectors,
        include_current_text:includeCurrentText,
        max_text_chars:maxTextChars,
        max_diff_chars:maxDiffChars,
        timeout_seconds:timeoutSeconds
      }
    },
    fetch:{bytes_received:fetched.bytes,duration_ms:fetched.durationMs}
  }));
}

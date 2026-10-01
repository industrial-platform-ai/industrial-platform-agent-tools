import { lookup } from 'node:dns/promises';
import net from 'node:net';
import * as cheerio from 'cheerio';
import ipaddr from 'ipaddr.js';

const MAX_RESPONSE_BYTES = 5_000_000;
const MAX_REDIRECTS = 5;
const BLOCKED_HOST_SUFFIXES = ['.localhost','.local','.internal','.home','.lan'];

function isPublicIpAddress(address) {
  try { return ipaddr.process(address).range() === 'unicast'; }
  catch { return false; }
}

function blockedHostname(hostname) {
  const h = hostname.toLowerCase().replace(/\.$/,'');
  return !h || h === 'localhost' || BLOCKED_HOST_SUFFIXES.some(s=>h.endsWith(s));
}

async function validatePublicUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw Object.assign(new Error('url is invalid.'),{statusCode:400}); }
  if (!['http:','https:'].includes(parsed.protocol)) throw Object.assign(new Error('Only http:// and https:// URLs are supported.'),{statusCode:400});
  if (parsed.username || parsed.password) throw Object.assign(new Error('Embedded URL credentials are not allowed.'),{statusCode:400});
  if (blockedHostname(parsed.hostname)) throw Object.assign(new Error('Local or private hostnames are not allowed.'),{statusCode:400});
  if (net.isIP(parsed.hostname)) {
    if (!isPublicIpAddress(parsed.hostname)) throw Object.assign(new Error('Private or reserved IP addresses are not allowed.'),{statusCode:400});
    return parsed;
  }
  const records = await lookup(parsed.hostname,{all:true,verbatim:true});
  if (!records.length) throw Object.assign(new Error('Hostname did not resolve.'),{statusCode:400});
  for (const record of records) if (!isPublicIpAddress(record.address)) throw Object.assign(new Error('Hostname resolves to a non-public IP address.'),{statusCode:400});
  return parsed;
}

async function readBody(response,maxBytes=MAX_RESPONSE_BYTES) {
  const declared=Number(response.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>maxBytes) throw new Error('Response is too large.');
  if(!response.body) return {body:'',bytes:0};
  const reader=response.body.getReader(); const chunks=[]; let total=0;
  while(true){
    const {done,value}=await reader.read();
    if(done) break;
    total+=value.byteLength;
    if(total>maxBytes){await reader.cancel();throw new Error('Response exceeded byte limit.');}
    chunks.push(Buffer.from(value));
  }
  const buffer=Buffer.concat(chunks,total);
  return {body:new TextDecoder('utf-8',{fatal:false}).decode(buffer),bytes:total};
}

async function fetchPublicPage(rawUrl,{timeoutSeconds=30}={}) {
  let currentUrl=rawUrl; const started=Date.now();
  for(let redirects=0;redirects<=MAX_REDIRECTS;redirects++){
    const validated=await validatePublicUrl(currentUrl);
    const response=await fetch(validated,{
      method:'GET',redirect:'manual',
      headers:{Accept:'text/html,application/xhtml+xml;q=0.9,*/*;q=0.4','User-Agent':'IndustrialPlatform-ArticleExtractor/1.0'},
      signal:AbortSignal.timeout(timeoutSeconds*1000)
    });
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get('location');
      if(!location) throw new Error('Redirect missing Location header.');
      if(redirects>=MAX_REDIRECTS) throw new Error('Too many redirects.');
      currentUrl=new URL(location,validated).href; continue;
    }
    if(!response.ok) throw new Error('Target returned HTTP '+response.status+'.');
    const contentType=response.headers.get('content-type')||'';
    if(!contentType.toLowerCase().includes('html')&&!contentType.toLowerCase().includes('xhtml')) throw new Error('Unsupported content type: '+(contentType||'unknown')+'.');
    const {body,bytes}=await readBody(response);
    return {body,bytes,finalUrl:validated.href,httpStatus:response.status,contentType,durationMs:Date.now()-started};
  }
  throw new Error('Too many redirects.');
}

function clean(value) {
  if(typeof value!=='string') return undefined;
  const text=value.replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  return text||undefined;
}

function meta($,...names) {
  for(const name of names) for(const selector of [`meta[name="${name}"]`,`meta[property="${name}"]`]){
    const value=clean($(selector).first().attr('content')); if(value) return value;
  }
  return undefined;
}

function absoluteUrl(value,base) {
  const v=clean(value); if(!v) return undefined;
  try{return new URL(v,base).href;}catch{return v;}
}

function candidateScore($,el) {
  const node=$(el); const text=clean(node.text())||''; const paragraphs=node.find('p').length;
  const linkText=node.find('a').map((_,a)=>$(a).text()).get().join(' ').length;
  const linkDensity=text.length?linkText/text.length:1;
  return text.length+paragraphs*180-linkDensity*text.length*1.2;
}

function extractArticle(html,finalUrl,{maxTextChars=150000}={}) {
  const $=cheerio.load(html);
  let root=$('article').first();
  if(!root.length||(clean(root.text())||'').length<200) root=$('main').first();
  if(!root.length||(clean(root.text())||'').length<200){
    const candidates=$('section,div').toArray().map(el=>({el,score:candidateScore($,el)})).sort((a,b)=>b.score-a.score);
    root=candidates.length?$(candidates[0].el):$('body');
  }
  root.find('script,style,noscript,template,svg,canvas,iframe,form,nav,footer,aside').remove();
  const paragraphs=root.find('p').map((_,p)=>clean($(p).text())).get().filter(p=>p&&p.length>=20).slice(0,800);
  let text=paragraphs.join('\n\n');
  if(text.length<200) text=clean(root.text())||'';
  const originalTextLength=text.length;
  const truncated=text.length>maxTextChars;
  if(truncated) text=text.slice(0,maxTextChars);
  const jsonLd=[];
  $('script[type="application/ld+json"]').each((_,el)=>{if(jsonLd.length<10){try{jsonLd.push(JSON.parse($(el).text()));}catch{}}});
  const wordCount=text?text.split(/\s+/).filter(Boolean).length:0;
  return {
    title:clean($('h1').first().text())||clean($('title').first().text())||null,
    description:meta($,'description','og:description')||null,
    author:meta($,'author','article:author','byl')||null,
    published_at:meta($,'article:published_time','date','datePublished','pubdate')||null,
    modified_at:meta($,'article:modified_time','last-modified','dateModified')||null,
    canonical:absoluteUrl($('link[rel="canonical"]').first().attr('href'),finalUrl)||null,
    language:clean($('html').attr('lang'))||null,
    text,word_count:wordCount,reading_time_minutes:wordCount?Math.max(1,Math.ceil(wordCount/225)):0,
    text_truncated:truncated,original_text_length:originalTextLength,json_ld:jsonLd
  };
}


function markdownEscapeInline(value='') {
  return String(value).replace(/\\/g,'\\\\').replace(/([*_\`])/g,'\\$1');
}

function extractMarkdown(html,finalUrl,{maxChars=150000}={}) {
  const $=cheerio.load(html);
  let root=$('article').first();
  if(!root.length||(clean(root.text())||'').length<200) root=$('main').first();
  if(!root.length||(clean(root.text())||'').length<200){
    const candidates=$('section,div').toArray().map(el=>({el,score:candidateScore($,el)})).sort((a,b)=>b.score-a.score);
    root=candidates.length?$(candidates[0].el):$('body');
  }
  root.find('script,style,noscript,template,svg,canvas,iframe,form,nav,footer,aside').remove();

  const blocks=[];
  root.find('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre').each((_,el)=>{
    const node=$(el);
    const tag=String(el.tagName||'').toLowerCase();
    let text=clean(node.text());
    if(!text) return;
    if(/^h[1-6]$/.test(tag)) {
      blocks.push('#'.repeat(Number(tag[1]))+' '+markdownEscapeInline(text));
      return;
    }
    if(tag==='li') { blocks.push('- '+markdownEscapeInline(text)); return; }
    if(tag==='blockquote') { blocks.push('> '+markdownEscapeInline(text).replace(/\n/g,'\n> ')); return; }
    if(tag==='pre') { blocks.push('\\`\\`\\`\n'+text.slice(0,12000)+'\n\\`\\`\\`'); return; }

    const clone=node.clone();
    clone.find('a').each((__,a)=>{
      const link=$(a);
      const label=clean(link.text())||'link';
      const href=absoluteUrl(link.attr('href'),finalUrl);
      link.replaceWith(href?'['+markdownEscapeInline(label)+']('+href+')':markdownEscapeInline(label));
    });
    text=clean(clone.text());
    if(text) blocks.push(text);
  });
  let markdown=blocks.join('\n\n').replace(/\n{3,}/g,'\n\n').trim();
  const originalLength=markdown.length;
  const truncated=originalLength>maxChars;
  if(truncated) markdown=markdown.slice(0,maxChars).trimEnd();
  return {markdown,markdown_length:markdown.length,original_markdown_length:originalLength,markdown_truncated:truncated};
}

export const documentTools=[{
  name:'extract-article',
  route:'/article',
  price:'$0.002',
  priceUsd:0.002,
  description:'Extract clean text from a public HTML article or document URL. Returns main content plus title, description, author, publish/modified dates, canonical URL, language, word count, reading time and JSON-LD for document parsing, summarization, research and RAG. Static public HTML only; no JavaScript rendering.',
  tags:['article','extract','web','documents','text','rag','content','research'],
  inputSchema:{
    type:'object',
    properties:{
      url:{type:'string',format:'uri',description:'Public http(s) article or document URL.'},
      max_text_chars:{type:'integer',minimum:1000,maximum:150000},
      timeout_seconds:{type:'integer',minimum:5,maximum:60}
    },
    required:['url'],
    additionalProperties:false
  },
  example:{url:'https://example.com/',max_text_chars:100000},
  run:async input=>{
    const url=typeof input?.url==='string'?input.url.trim():'';
    if(!url) throw Object.assign(new Error('url is required.'),{statusCode:400});
    const maxTextChars=Number.isInteger(input?.max_text_chars)?Math.min(150000,Math.max(1000,input.max_text_chars)):100000;
    const timeoutSeconds=Number.isInteger(input?.timeout_seconds)?Math.min(60,Math.max(5,input.timeout_seconds)):30;
    const fetched=await fetchPublicPage(url,{timeoutSeconds});
    const article=extractArticle(fetched.body,fetched.finalUrl,{maxTextChars});
    if(!article.text||article.word_count<20) throw Object.assign(new Error('No substantial article content was detected.'),{statusCode:422});
    return {status:'ready',url,final_url:fetched.finalUrl,fetched_at:new Date().toISOString(),http_status:fetched.httpStatus,content_type:fetched.contentType,response_bytes:fetched.bytes,latency_ms:fetched.durationMs,...article,untrusted_content:true};
  }
},{
  name:'url-to-markdown',
  route:'/web/markdown',
  price:'$0.0009',
  priceUsd:0.0009,
  description:'Convert a public webpage URL to clean agent-ready Markdown for web reading, document extraction, grounding, RAG ingestion, article parsing, research and LLM context. Strips navigation, scripts and boilerplate from static public HTML; designed for URL-to-Markdown agent workflows.',
  tags:['web','url-to-markdown','markdown','web-reading','content-extraction','rag','grounding','research','agents'],
  inputSchema:{
    type:'object',
    properties:{
      url:{type:'string',format:'uri',description:'Public http(s) webpage URL.'},
      max_chars:{type:'integer',minimum:1000,maximum:150000},
      timeout_seconds:{type:'integer',minimum:5,maximum:60}
    },
    required:['url'],
    additionalProperties:false
  },
  example:{url:'https://example.com/',max_chars:100000},
  run:async input=>{
    const url=typeof input?.url==='string'?input.url.trim():'';
    if(!url) throw Object.assign(new Error('url is required.'),{statusCode:400});
    const maxChars=Number.isInteger(input?.max_chars)?Math.min(150000,Math.max(1000,input.max_chars)):100000;
    const timeoutSeconds=Number.isInteger(input?.timeout_seconds)?Math.min(60,Math.max(5,input.timeout_seconds)):30;
    const fetched=await fetchPublicPage(url,{timeoutSeconds});
    const article=extractArticle(fetched.body,fetched.finalUrl,{maxTextChars:maxChars});
    const md=extractMarkdown(fetched.body,fetched.finalUrl,{maxChars});
    if(!md.markdown||md.markdown.length<100) throw Object.assign(new Error('No substantial readable content was detected.'),{statusCode:422});
    return {
      status:'ready',url,final_url:fetched.finalUrl,fetched_at:new Date().toISOString(),
      http_status:fetched.httpStatus,content_type:fetched.contentType,response_bytes:fetched.bytes,
      latency_ms:fetched.durationMs,title:article.title,description:article.description,
      author:article.author,published_at:article.published_at,canonical:article.canonical,
      language:article.language,...md,untrusted_content:true
    };
  }
}];

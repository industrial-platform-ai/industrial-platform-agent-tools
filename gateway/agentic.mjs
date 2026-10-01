import dns from 'node:dns/promises';
import net from 'node:net';
import ipaddr from 'ipaddr.js';
import * as cheerio from 'cheerio';

const BLOCKED_HOST_SUFFIXES=['.localhost','.local','.internal','.home','.lan'];

function clean(value){
  return String(value??'').replace(/\u00a0/g,' ').replace(/[\t ]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
}
function bounded(value,field,max=500000){
  if(typeof value!=='string') throw Object.assign(new Error(field+' is required.'),{statusCode:400});
  if(value.length>max) throw Object.assign(new Error(field+' exceeds '+max+' characters.'),{statusCode:400});
  return value;
}
function publicIp(address){
  try{return ipaddr.process(address).range()==='unicast';}catch{return false;}
}
function blockedHost(hostname){
  const h=String(hostname||'').toLowerCase().replace(/\.$/,'');
  return !h||h==='localhost'||BLOCKED_HOST_SUFFIXES.some(s=>h.endsWith(s));
}
async function validatePublicUrl(raw){
  let u; try{u=new URL(raw);}catch{throw Object.assign(new Error('url is invalid. Retry with a full http:// or https:// URL.'),{statusCode:400});}
  if(!['http:','https:'].includes(u.protocol)) throw Object.assign(new Error('Only http(s) URLs are supported.'),{statusCode:400});
  if(u.username||u.password||blockedHost(u.hostname)) throw Object.assign(new Error('Local/private or credentialed URLs are not allowed.'),{statusCode:400});
  if(net.isIP(u.hostname)){
    if(!publicIp(u.hostname)) throw Object.assign(new Error('Non-public IP addresses are not allowed.'),{statusCode:400});
  }else{
    const rows=await dns.lookup(u.hostname,{all:true,verbatim:true});
    if(!rows.length||rows.some(r=>!publicIp(r.address))) throw Object.assign(new Error('Hostname resolves to a non-public address.'),{statusCode:400});
  }
  return u;
}
async function fetchPublic(raw,{method='GET',timeoutMs=10000,maxBytes=2000000}={}){
  let current=await validatePublicUrl(raw);
  const started=Date.now();
  let redirects=0;
  for(;redirects<=5;redirects++){
    const response=await fetch(current,{
      method,
      redirect:'manual',
      headers:{'user-agent':'IndustrialPlatform-AgenticTools/1.0','accept':'*/*'},
      signal:AbortSignal.timeout(timeoutMs)
    });
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get('location');
      if(!location) return {response,current,redirects,latencyMs:Date.now()-started};
      current=await validatePublicUrl(new URL(location,current).href);
      continue;
    }
    if(method==='HEAD') return {response,current,redirects,latencyMs:Date.now()-started};
    const reader=response.body?.getReader();
    if(!reader) return {response,current,redirects,latencyMs:Date.now()-started,body:''};
    const chunks=[]; let total=0;
    while(true){
      const {done,value}=await reader.read();
      if(done) break;
      total+=value.byteLength;
      if(total>maxBytes) throw Object.assign(new Error('Remote content exceeded the 2 MB safety limit.'),{statusCode:413});
      chunks.push(value);
    }
    const body=Buffer.concat(chunks.map(x=>Buffer.from(x))).toString('utf8');
    return {response,current,redirects,latencyMs:Date.now()-started,body};
  }
  throw Object.assign(new Error('Too many redirects.'),{statusCode:502});
}

function typeOk(value,type){
  if(type==='null') return value===null;
  if(type==='array') return Array.isArray(value);
  if(type==='object') return value!==null&&typeof value==='object'&&!Array.isArray(value);
  if(type==='integer') return Number.isInteger(value);
  if(type==='number') return typeof value==='number'&&Number.isFinite(value);
  return typeof value===type;
}
function validateSchema(value,schema,path='$',errors=[]){
  if(!schema||typeof schema!=='object') return errors;
  const types=Array.isArray(schema.type)?schema.type:(schema.type?[schema.type]:[]);
  if(types.length&&!types.some(t=>typeOk(value,t))){
    errors.push({path,keyword:'type',expected:types,actual:Array.isArray(value)?'array':value===null?'null':typeof value,fix:'Provide a value matching the expected JSON type.'});
    return errors;
  }
  if(Array.isArray(schema.enum)&&!schema.enum.some(v=>JSON.stringify(v)===JSON.stringify(value))){
    errors.push({path,keyword:'enum',expected:schema.enum,fix:'Retry with one of the allowed enum values.'});
  }
  if(Object.prototype.hasOwnProperty.call(schema,'const')&&JSON.stringify(schema.const)!==JSON.stringify(value)){
    errors.push({path,keyword:'const',expected:schema.const,fix:'Retry with the required constant value.'});
  }
  if(typeof value==='string'){
    if(Number.isInteger(schema.minLength)&&value.length<schema.minLength) errors.push({path,keyword:'minLength',expected:schema.minLength,actual:value.length,fix:'Provide a longer string.'});
    if(Number.isInteger(schema.maxLength)&&value.length>schema.maxLength) errors.push({path,keyword:'maxLength',expected:schema.maxLength,actual:value.length,fix:'Provide a shorter string.'});
    if(typeof schema.pattern==='string'){
      try{if(!(new RegExp(schema.pattern)).test(value)) errors.push({path,keyword:'pattern',expected:schema.pattern,fix:'Retry with a string matching the required pattern.'});}catch{}
    }
  }
  if(typeof value==='number'&&Number.isFinite(value)){
    if(typeof schema.minimum==='number'&&value<schema.minimum) errors.push({path,keyword:'minimum',expected:schema.minimum,actual:value,fix:'Use a number at or above the minimum.'});
    if(typeof schema.maximum==='number'&&value>schema.maximum) errors.push({path,keyword:'maximum',expected:schema.maximum,actual:value,fix:'Use a number at or below the maximum.'});
  }
  if(Array.isArray(value)){
    if(Number.isInteger(schema.minItems)&&value.length<schema.minItems) errors.push({path,keyword:'minItems',expected:schema.minItems,actual:value.length,fix:'Add more array items.'});
    if(Number.isInteger(schema.maxItems)&&value.length>schema.maxItems) errors.push({path,keyword:'maxItems',expected:schema.maxItems,actual:value.length,fix:'Remove array items.'});
    if(schema.items&&typeof schema.items==='object') value.forEach((v,i)=>validateSchema(v,schema.items,path+'['+i+']',errors));
  }
  if(value&&typeof value==='object'&&!Array.isArray(value)){
    const props=schema.properties&&typeof schema.properties==='object'?schema.properties:{};
    for(const key of Array.isArray(schema.required)?schema.required:[]){
      if(!Object.prototype.hasOwnProperty.call(value,key)) errors.push({path:path+'.'+key,keyword:'required',fix:'Add the required property "'+key+'".'});
    }
    for(const [k,v] of Object.entries(value)){
      if(props[k]) validateSchema(v,props[k],path+'.'+k,errors);
      else if(schema.additionalProperties===false) errors.push({path:path+'.'+k,keyword:'additionalProperties',fix:'Remove unsupported property "'+k+'".'});
    }
  }
  return errors;
}

function escapeMd(s){return String(s||'').replace(/([\\*_{}\[\]()#+.!|>~-])/g,'\\$1');}
function htmlToMarkdown(html,maxChars){
  const $=cheerio.load(html);
  $('script,style,noscript,template,svg,canvas,iframe').remove();
  const blocks=[];
  $('body').find('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,table').each((_,el)=>{
    const node=$(el),tag=String(el.tagName||'').toLowerCase();
    if(/^h[1-6]$/.test(tag)){const t=clean(node.text());if(t)blocks.push('#'.repeat(Number(tag[1]))+' '+escapeMd(t));return;}
    if(tag==='li'){const t=clean(node.text());if(t)blocks.push('- '+escapeMd(t));return;}
    if(tag==='blockquote'){const t=clean(node.text());if(t)blocks.push('> '+escapeMd(t));return;}
    if(tag==='pre'){const t=node.text().trim();if(t)blocks.push('~~~\\n'+t.slice(0,12000)+'\\n~~~');return;}
    if(tag==='table'){
      const rows=[]; node.find('tr').each((__,tr)=>{const cells=[];$(tr).find('th,td').each((___,td)=>cells.push(clean($(td).text())));if(cells.length)rows.push(cells);});
      if(rows.length){const width=Math.max(...rows.map(r=>r.length));const head=rows[0];blocks.push('| '+Array.from({length:width},(_,i)=>escapeMd(head[i]||'')).join(' | ')+' |\\n| '+Array(width).fill('---').join(' | ')+' |'+rows.slice(1).map(r=>'\\n| '+Array.from({length:width},(_,i)=>escapeMd(r[i]||'')).join(' | ')+' |').join(''));}
      return;
    }
    const clone=node.clone();
    clone.find('a[href]').each((__,a)=>{const l=$(a),label=clean(l.text())||'link',href=l.attr('href');l.replaceWith(href?'['+escapeMd(label)+']('+href+')':escapeMd(label));});
    const t=clean(clone.text());if(t)blocks.push(escapeMd(t));
  });
  let markdown=blocks.join('\\n\\n').replace(/\\n{3,}/g,'\\n\\n').trim();
  const originalLength=markdown.length;
  const truncated=originalLength>maxChars;
  if(truncated) markdown=markdown.slice(0,maxChars).trimEnd();
  return {markdown,markdown_length:markdown.length,original_markdown_length:originalLength,markdown_truncated:truncated};
}

function uniq(arr){return [...new Set(arr.filter(Boolean))];}
function entities(text){
  const emails=uniq((text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)||[]).map(x=>x.toLowerCase()));
  const urls=uniq((text.match(/https?:\/\/[^\s<>"']+/gi)||[]).map(x=>x.replace(/[),.;!?]+$/,'')));
  const mentions=uniq(text.match(/(^|\s)@[A-Za-z0-9_]{1,64}\b/g)?.map(x=>x.trim())||[]);
  const hashtags=uniq(text.match(/(^|\s)#[\p{L}\p{N}_-]{1,80}\b/gu)?.map(x=>x.trim())||[]);
  const phones=uniq((text.match(/(?:\+?\d[\d .()\-]{6,}\d)/g)||[]).map(x=>x.trim()));
  const ipv4=uniq((text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)||[]).filter(ip=>net.isIPv4(ip)));
  return {emails,urls,phones,mentions,hashtags,ipv4};
}

function firstText(root,selectors){
  for(const s of selectors){const v=clean(root.find(s).first().text());if(v)return v;} return null;
}
function firstAttr(root,selectors,attr){
  for(const s of selectors){const v=root.find(s).first().attr(attr);if(v)return clean(v);} return null;
}
function parseFeed(xml,limit){
  const $=cheerio.load(xml,{xmlMode:true});
  const isAtom=$('feed').length>0;
  const root=isAtom?$('feed').first():$('channel').first();
  const items=(isAtom?$('entry').toArray():$('item').toArray()).slice(0,limit).map(el=>{
    const node=$(el);
    const rawLink=isAtom?(node.find('link[rel="alternate"]').attr('href')||node.find('link').first().attr('href')):node.find('link').first().text();
    const rawDate=isAtom?(node.find('published').first().text()||node.find('updated').first().text()):(node.find('pubDate').first().text()||node.find('dc\\:date').first().text());
    const d=rawDate?new Date(rawDate):null;
    return {
      title:clean(node.find('title').first().text())||null,
      link:clean(rawLink)||null,
      published_at:d&&!Number.isNaN(d.getTime())?d.toISOString():null,
      author:isAtom?clean(node.find('author > name').first().text())||null:clean(node.find('author').first().text()||node.find('dc\\:creator').first().text())||null,
      summary:clean(node.find(isAtom?'summary,content':'description,content\\:encoded').first().text()).slice(0,12000)||null,
      id:clean(node.find(isAtom?'id':'guid').first().text())||null
    };
  });
  return {
    format:isAtom?'atom':'rss',
    feed:{
      title:firstText(root,['title']),
      link:isAtom?firstAttr(root,['link[rel="alternate"]','link'],'href'):firstText(root,['link']),
      description:firstText(root,isAtom?['subtitle']:['description'])
    },
    count:items.length,
    items
  };
}

export const agenticTools=[
  {
    name:'json-schema-validate',
    route:'/json/schema/validate',
    price:'$0.0005',priceUsd:0.0005,
    description:'JSON Schema Validate: validate a JSON value against a deterministic schema subset for agent payload checking and structured-output verification. Supports type, properties, required, enum, const, numeric/string/array bounds, pattern, items and additionalProperties=false. Returns machine-readable error paths plus retry guidance.',
    tags:['json','json-schema','validate','validation','payload','agent','structured-output'],
    inputSchema:{type:'object',properties:{value:{},schema:{type:'object'}},required:['value','schema'],additionalProperties:false},
    example:{value:{name:'Ada'},schema:{type:'object',required:['name'],properties:{name:{type:'string'}}}},
    run:async input=>{
      if(!input?.schema||typeof input.schema!=='object'||Array.isArray(input.schema)) throw Object.assign(new Error('schema must be a JSON object. Retry with {"value":...,"schema":{...}}.'),{statusCode:400});
      const errors=validateSchema(input.value,input.schema).slice(0,500);
      return {valid:errors.length===0,error_count:errors.length,errors};
    }
  },
  {
    name:'html-to-markdown',
    route:'/html/markdown',
    price:'$0.0005',priceUsd:0.0005,
    description:'Convert HTML to Markdown: transform supplied HTML into clean deterministic Markdown for LLM context, RAG, tool chaining and agent memory. Preserves headings, paragraphs, lists, blockquotes, links, code blocks and simple tables; no network fetch required.',
    tags:['html','markdown','convert','rag','llm','content','agent','transformation'],
    inputSchema:{type:'object',properties:{html:{type:'string',maxLength:500000},max_chars:{type:'integer',minimum:100,maximum:250000}},required:['html'],additionalProperties:false},
    example:{html:'<article><h1>Hello</h1><p>Read <a href="https://example.com">more</a>.</p></article>',max_chars:100000},
    run:async input=>htmlToMarkdown(bounded(input?.html,'html'),Number.isInteger(input?.max_chars)?input.max_chars:100000)
  },
  {
    name:'extract-entities',
    route:'/text/entities',
    price:'$0.0005',priceUsd:0.0005,
    description:'Extract entities from text: emails, HTTP(S) URLs, phone-like numbers, @mentions, #hashtags and IPv4 addresses. Deterministic, no LLM or network call, with stable JSON output for crawlers and autonomous agent pipelines.',
    tags:['entities','extract','email','url','phone','hashtag','mention','ipv4','text','agent'],
    inputSchema:{type:'object',properties:{text:{type:'string',maxLength:500000}},required:['text'],additionalProperties:false},
    example:{text:'Contact ada@example.com, see https://example.com, ping @ada #research'},
    run:async input=>{const text=bounded(input?.text,'text');const result=entities(text);return{...result,counts:Object.fromEntries(Object.entries(result).map(([k,v])=>[k,v.length]))};}
  },
  {
    name:'http-status',
    route:'/http/status',
    price:'$0.0009',priceUsd:0.0009,
    description:'HTTP status check for a public URL: return reachability, status code, redirect count, final URL, latency, content type, server and cache headers. One required url field for uptime checks, fallback routing and autonomous web-agent health tests.',
    tags:['http','status','url','uptime','latency','redirect','health','web','agent'],
    inputSchema:{type:'object',properties:{url:{type:'string',format:'uri'}},required:['url'],additionalProperties:false},
    example:{url:'https://example.com/'},
    run:async input=>{
      const url=bounded(input?.url,'url',8192);
      let result=await fetchPublic(url,{method:'HEAD',timeoutMs:10000});
      if([405,501].includes(result.response.status)) result=await fetchPublic(url,{method:'GET',timeoutMs:10000,maxBytes:100000});
      return {
        reachable:true,url,final_url:result.current.href,status:result.response.status,status_text:result.response.statusText,
        redirects:result.redirects,latency_ms:result.latencyMs,content_type:result.response.headers.get('content-type'),
        server:result.response.headers.get('server'),cache_control:result.response.headers.get('cache-control'),
        checked_at:new Date().toISOString()
      };
    }
  },
  {
    name:'rss-to-json',
    route:'/rss/json',
    price:'$0.001',priceUsd:0.001,
    description:'RSS / Atom to JSON: fetch a public feed and return normalized structured JSON for autonomous monitoring, news ingestion and agent workflows. One required feed URL; returns title, link, published_at, author, summary and id for up to 100 items.',
    tags:['rss','atom','feed','json','news','monitoring','ingestion','agent'],
    inputSchema:{type:'object',properties:{url:{type:'string',format:'uri'},limit:{type:'integer',minimum:1,maximum:100}},required:['url'],additionalProperties:false},
    example:{url:'https://hnrss.org/frontpage',limit:25},
    run:async input=>{
      const url=bounded(input?.url,'url',8192),limit=Number.isInteger(input?.limit)?input.limit:50;
      const fetched=await fetchPublic(url,{method:'GET',timeoutMs:10000,maxBytes:2000000});
      if(!fetched.response.ok) throw Object.assign(new Error('Feed returned HTTP '+fetched.response.status+'. Retry with a reachable RSS or Atom URL.'),{statusCode:502});
      const parsed=parseFeed(fetched.body,limit);
      if(!parsed.count) throw Object.assign(new Error('No RSS/Atom items were found. Retry with a direct feed URL.'),{statusCode:422});
      return {status:'ready',url,final_url:fetched.current.href,http_status:fetched.response.status,redirects:fetched.redirects,latency_ms:fetched.latencyMs,fetched_at:new Date().toISOString(),...parsed};
    }
  },
  {
    name:'sitemap-urls',
    route:'/web/sitemap-urls',
    price:'$0.001',priceUsd:0.001,
    description:'Sitemap URL extractor for crawlers and autonomous agents. Fetch and parse a public sitemap.xml or sitemap index, recursively expand child sitemap indexes up to two levels, and return deduplicated page URLs with loc, lastmod, changefreq and priority.',
    tags:['sitemap','sitemap.xml','xml','urls','crawl','crawler','seo','discovery','agent','web'],
    inputSchema:{type:'object',properties:{url:{type:'string',format:'uri'},limit:{type:'integer',minimum:1,maximum:2000},max_depth:{type:'integer',minimum:0,maximum:2}},required:['url'],additionalProperties:false},
    outputSchema:{type:'object',properties:{status:{type:'string'},root_url:{type:'string'},count:{type:'integer'},truncated:{type:'boolean'},sitemaps:{type:'array',items:{type:'object',properties:{url:{type:'string'},final_url:{type:'string'},http_status:{type:'integer'},depth:{type:'integer'},type:{type:'string'}}}},urls:{type:'array',items:{type:'object',properties:{loc:{type:'string'},lastmod:{},changefreq:{},priority:{}},required:['loc']}},fetched_at:{type:'string'}},required:['status','root_url','count','truncated','sitemaps','urls','fetched_at']},
    example:{url:'https://example.com/sitemap.xml',limit:500,max_depth:2},
    run:async input=>{
      const rootUrl=bounded(input?.url,'url',8192);
      const limit=Number.isInteger(input?.limit)?input.limit:500;
      const maxDepth=Number.isInteger(input?.max_depth)?input.max_depth:2;
      const seenSitemaps=new Set(), seenUrls=new Set(), urls=[], sitemaps=[];
      const walk=async (url,depth)=>{
        if(seenSitemaps.has(url)||depth>maxDepth||urls.length>=limit) return;
        seenSitemaps.add(url);
        const fetched=await fetchPublic(url,{method:'GET',timeoutMs:10000,maxBytes:2000000});
        if(!fetched.response.ok) throw Object.assign(new Error('Sitemap returned HTTP '+fetched.response.status+'. Retry with a reachable sitemap URL.'),{statusCode:502});
        const $=cheerio.load(fetched.body,{xmlMode:true});
        const index=$('sitemapindex').length>0;
        sitemaps.push({url,final_url:fetched.current.href,http_status:fetched.response.status,depth,type:index?'index':'urlset'});
        if(index){
          const children=$('sitemap > loc').toArray().map(el=>clean($(el).text())).filter(Boolean).slice(0,1000);
          for(const child of children){
            if(urls.length>=limit) break;
            let resolved; try{resolved=new URL(child,fetched.current).href;}catch{continue;}
            await walk(resolved,depth+1);
          }
          return;
        }
        $('url').each((_,el)=>{
          if(urls.length>=limit) return false;
          const node=$(el),loc=clean(node.find('loc').first().text());
          if(!loc||seenUrls.has(loc)) return;
          seenUrls.add(loc);
          urls.push({loc,lastmod:clean(node.find('lastmod').first().text())||null,changefreq:clean(node.find('changefreq').first().text())||null,priority:clean(node.find('priority').first().text())||null});
        });
      };
      await walk(rootUrl,0);
      return {status:'ready',root_url:rootUrl,count:urls.length,truncated:urls.length>=limit,sitemaps,urls,fetched_at:new Date().toISOString()};
    }
  },
  {
    name:'webpage-links',
    route:'/web/links',
    price:'$0.001',priceUsd:0.001,
    description:'Extract links from webpage URL: fetch one public page and return normalized absolute hyperlinks with anchor text, rel, domain and internal/external classification. One required URL, deterministic JSON, deduplicated results, and optional same-domain filtering for crawler planning and agent navigation.',
    tags:['links','webpage','crawl','outlinks','navigation','url','agent','web'],
    inputSchema:{type:'object',properties:{url:{type:'string',format:'uri'},scope:{type:'string',enum:['all','internal','external']},limit:{type:'integer',minimum:1,maximum:2000}},required:['url'],additionalProperties:false},
    example:{url:'https://example.com/',scope:'all',limit:500},
    run:async input=>{
      const url=bounded(input?.url,'url',8192),scope=input?.scope||'all',limit=Number.isInteger(input?.limit)?input.limit:500;
      const fetched=await fetchPublic(url,{method:'GET',timeoutMs:10000,maxBytes:2000000});
      if(!fetched.response.ok) throw Object.assign(new Error('Page returned HTTP '+fetched.response.status+'. Retry with a reachable public HTML URL.'),{statusCode:502});
      const type=(fetched.response.headers.get('content-type')||'').toLowerCase();
      if(type&&!type.includes('html')&&!type.includes('xhtml')) throw Object.assign(new Error('Target is not an HTML page. Retry with a public webpage URL.'),{statusCode:422});
      const $=cheerio.load(fetched.body);
      const origin=fetched.current.origin,seen=new Set(),links=[];
      $('a[href]').each((_,el)=>{
        if(links.length>=limit) return false;
        const raw=$(el).attr('href'); if(!raw||/^(?:javascript:|data:|mailto:|tel:)/i.test(raw)) return;
        let href; try{href=new URL(raw,fetched.current).href;}catch{return;}
        const u=new URL(href); if(!['http:','https:'].includes(u.protocol)) return;
        u.hash=''; href=u.href;
        if(seen.has(href)) return;
        const external=u.origin!==origin;
        if(scope==='internal'&&external) return;
        if(scope==='external'&&!external) return;
        seen.add(href);
        links.push({href,text:clean($(el).text()).slice(0,500)||null,rel:clean($(el).attr('rel'))||null,domain:u.hostname,is_external:external});
      });
      return {status:'ready',url,final_url:fetched.current.href,title:clean($('title').first().text())||null,scope,count:links.length,truncated:links.length>=limit,links,fetched_at:new Date().toISOString()};
    }
  },
  {
    name:'json-repair',
    route:'/json/repair',
    price:'$0.0005',priceUsd:0.0005,
    description:'Repair malformed JSON / LLM output: convert common broken JSON into valid structured JSON. Removes Markdown-style fences and prose wrappers, trailing commas, normalizes Python True/False/None and smart quotes, and repairs common single-quoted keys and values. Returns the parsed result plus applied repair steps.',
    tags:['json','repair','llm','structured-output','malformed','parse','agent','recovery'],
    inputSchema:{type:'object',properties:{text:{type:'string',maxLength:250000}},required:['text'],additionalProperties:false},
    example:{text:"~~~json\n{'ok': True, 'items': [1,2,],}\n~~~"},
    run:async input=>{
      let text=bounded(input?.text,'text',250000).trim(),parsed;
      try{parsed=JSON.parse(text);return{repaired:false,result:parsed,steps:[]};}catch{}
      const steps=[];
      const fenced=text.match(/^~~~(?:json)?\s*([\s\S]*?)\s*~~~$/i);
      if(fenced){text=fenced[1];steps.push('removed_markdown_fence');}
      const starts=[text.indexOf('{'),text.indexOf('[')].filter(i=>i>=0);
      const first=starts.length?Math.min(...starts):-1;
      const last=Math.max(text.lastIndexOf('}'),text.lastIndexOf(']'));
      if(first>0&&last>=first){text=text.slice(first,last+1);steps.push('trimmed_prose_wrapper');}
      const smart=text.replace(/[“”]/g,'"').replace(/[‘’]/g,"'");
      if(smart!==text){text=smart;steps.push('normalized_smart_quotes');}
      const py=text.replace(/\bTrue\b/g,'true').replace(/\bFalse\b/g,'false').replace(/\bNone\b/g,'null');
      if(py!==text){text=py;steps.push('converted_python_literals');}
      const trailing=text.replace(/,\s*([}\]])/g,'$1');
      if(trailing!==text){text=trailing;steps.push('removed_trailing_commas');}
      const keys=text.replace(/([{,]\s*)'([^'\\]*(?:\\.[^'\\]*)*)'\s*:/g,'$1"$2":');
      if(keys!==text){text=keys;steps.push('normalized_single_quoted_keys');}
      const vals=text.replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'(?=\s*[,}])/g,(_,v)=>': '+JSON.stringify(v.replace(/\\'/g,"'")));
      if(vals!==text){text=vals;steps.push('normalized_single_quoted_values');}
      try{parsed=JSON.parse(text);}catch(error){
        throw Object.assign(new Error('Unable to repair JSON automatically. Retry with only the JSON object or array and matching string quotes. Parser: '+String(error?.message||error)),{statusCode:422});
      }
      return {repaired:true,result:parsed,steps};
    }
  }
];

import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import { diffLines } from 'diff';

const textSchema = {
  type:'object',
  properties:{text:{type:'string',maxLength:250000}},
  required:['text'],
  additionalProperties:false
};

function boundedText(value, field='text') {
  if (typeof value !== 'string') throw Object.assign(new Error(field+' is required.'), {statusCode:400});
  if (value.length > 250000) throw Object.assign(new Error(field+' exceeds 250000 characters.'), {statusCode:400});
  return value;
}

function clean(value) {
  return String(value ?? '').replace(/\u00a0/g,' ').replace(/[\t ]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonicalize(value[k])]));
  }
  return value;
}

export const utilityTools = [
  {
    name:'sha256-hash', route:'/hash', price:'$0.0005', priceUsd:0.0005,
    description:'Hash text deterministically with SHA-256 for cache keys, integrity checks, deduplication and agent workflows.',
    tags:['hash','sha256','integrity','utility'],
    inputSchema:textSchema,
    example:{text:'hello world'},
    run: async input => ({algorithm:'sha256',digest:createHash('sha256').update(boundedText(input?.text),'utf8').digest('hex')})
  },
  {
    name:'base64-encode', route:'/base64/encode', price:'$0.0005', priceUsd:0.0005,
    description:'Encode UTF-8 text as Base64.',
    tags:['base64','encode','conversion','utility'],
    inputSchema:textSchema,
    example:{text:'hello world'},
    run: async input => ({encoding:'base64',result:Buffer.from(boundedText(input?.text),'utf8').toString('base64')})
  },
  {
    name:'base64-decode', route:'/base64/decode', price:'$0.0005', priceUsd:0.0005,
    description:'Decode Base64 into UTF-8 text.',
    tags:['base64','decode','conversion','utility'],
    inputSchema:{
      type:'object',properties:{value:{type:'string',maxLength:400000}},required:['value'],additionalProperties:false
    },
    example:{value:'aGVsbG8gd29ybGQ='},
    run: async input => {
      const value=boundedText(input?.value,'value');
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value.replace(/\s+/g,''))) throw Object.assign(new Error('value is not valid Base64.'),{statusCode:400});
      return {encoding:'utf8',result:Buffer.from(value,'base64').toString('utf8')};
    }
  },
  {
    name:'json-canonicalize', route:'/json/canonicalize', price:'$0.0005', priceUsd:0.0005,
    description:'Canonicalize JSON by recursively sorting object keys for stable hashing, comparison and signatures.',
    tags:['json','canonicalize','normalize','utility'],
    inputSchema:{type:'object',properties:{value:{}},required:['value'],additionalProperties:false},
    example:{value:{b:2,a:1}},
    run: async input => ({result:canonicalize(input?.value)})
  },
  {
    name:'querystring', route:'/querystring', price:'$0.0005', priceUsd:0.0005,
    description:'Parse a URL query string into structured JSON or build a query string from an object.',
    tags:['querystring','url','parse','build','conversion'],
    inputSchema:{
      type:'object',
      properties:{mode:{type:'string',enum:['parse','build']},value:{}},
      required:['value'],
      additionalProperties:false
    },
    example:{mode:'parse',value:'a=1&b=hello%20world&a=2'},
    run: async input => {
      const mode=input?.mode || 'parse';
      if (mode==='build') {
        if (!input?.value || typeof input.value!=='object' || Array.isArray(input.value)) throw Object.assign(new Error('build mode requires value to be an object.'),{statusCode:400});
        const p=new URLSearchParams();
        for (const [k,v] of Object.entries(input.value)) {
          if (Array.isArray(v)) for (const item of v) p.append(k,String(item));
          else if (v!==undefined && v!==null) p.append(k,String(v));
        }
        return {mode,result:p.toString()};
      }
      const raw=boundedText(input?.value,'value').replace(/^\?/,'');
      const p=new URLSearchParams(raw);
      const result={};
      for (const [k,v] of p.entries()) {
        if (result[k]===undefined) result[k]=v;
        else if (Array.isArray(result[k])) result[k].push(v);
        else result[k]=[result[k],v];
      }
      return {mode,result};
    }
  },
  {
    name:'url-inspect', route:'/url/inspect', price:'$0.0005', priceUsd:0.0005,
    description:'Normalize a URL and return its origin, host, path, query parameters and fragments as structured JSON.',
    tags:['url','normalize','parse','utility'],
    inputSchema:{type:'object',properties:{url:{type:'string',maxLength:8192}},required:['url'],additionalProperties:false},
    example:{url:'https://example.com/a?x=1#top'},
    run: async input => {
      let u; try{u=new URL(boundedText(input?.url,'url'));}catch{throw Object.assign(new Error('url is invalid.'),{statusCode:400});}
      return {href:u.href,protocol:u.protocol,origin:u.origin,hostname:u.hostname,port:u.port||null,pathname:u.pathname,search:u.search,hash:u.hash,query:Object.fromEntries(u.searchParams.entries())};
    }
  },
  {
    name:'text-stats', route:'/text/stats', price:'$0.0005', priceUsd:0.0005,
    description:'Return deterministic character, byte, word, line and sentence counts for text.',
    tags:['text','count','stats','utility'],
    inputSchema:textSchema,
    example:{text:'Hello world.\nSecond line.'},
    run: async input => {
      const text=boundedText(input?.text);
      const words=text.trim()?text.trim().split(/\s+/).length:0;
      const lines=text===''?0:text.split(/\r?\n/).length;
      const sentences=(text.match(/[.!?]+(?:\s|$)/g)||[]).length;
      return {characters:[...text].length,bytes:Buffer.byteLength(text,'utf8'),words,lines,sentences};
    }
  },
  {
    name:'text-diff', route:'/text/diff', price:'$0.0005', priceUsd:0.0005,
    description:'Compare two text values and return added and removed line blocks plus deterministic hashes.',
    tags:['text','diff','compare','utility'],
    inputSchema:{
      type:'object',
      properties:{before:{type:'string',maxLength:125000},after:{type:'string',maxLength:125000}},
      required:['before','after'],
      additionalProperties:false
    },
    example:{before:'alpha\nbeta',after:'alpha\ngamma'},
    run: async input => {
      const before=boundedText(input?.before,'before'), after=boundedText(input?.after,'after');
      const parts=diffLines(before,after);
      return {
        changed:before!==after,
        before_sha256:createHash('sha256').update(before).digest('hex'),
        after_sha256:createHash('sha256').update(after).digest('hex'),
        parts:parts.slice(0,500).map(p=>({added:!!p.added,removed:!!p.removed,value:p.value.slice(0,12000)}))
      };
    }
  },
  {
    name:'html-to-text', route:'/html/text', price:'$0.0005', priceUsd:0.0005,
    description:'Convert supplied HTML into clean normalized text without network access.',
    tags:['html','text','extract','documents'],
    inputSchema:{type:'object',properties:{html:{type:'string',maxLength:500000}},required:['html'],additionalProperties:false},
    example:{html:'<article><h1>Hello</h1><p>World</p></article>'},
    run: async input => {
      const html=boundedText(input?.html,'html');
      const $=cheerio.load(html);
      $('script,style,noscript,template,svg,canvas,iframe').remove();
      $('br').replaceWith('\n');
      $('p,h1,h2,h3,h4,h5,h6,li,div,section,article,tr').each((_,el)=>$(el).append('\n'));
      const text=clean($('body').length?$('body').text():$.root().text());
      return {text,text_length:text.length};
    }
  },
  {
    name:'html-links', route:'/html/links', price:'$0.0005', priceUsd:0.0005,
    description:'Extract links and anchor text from supplied HTML, resolving relative URLs against an optional base URL.',
    tags:['html','links','extract','web'],
    inputSchema:{
      type:'object',
      properties:{html:{type:'string',maxLength:500000},base_url:{type:'string',maxLength:8192}},
      required:['html'],
      additionalProperties:false
    },
    example:{html:'<a href="/docs">Docs</a>',base_url:'https://example.com/'},
    run: async input => {
      const html=boundedText(input?.html,'html');
      const base=typeof input?.base_url==='string'&&input.base_url?input.base_url:undefined;
      const $=cheerio.load(html);
      const links=[];
      $('a[href]').each((_,el)=>{
        if (links.length>=1000) return;
        const href=$(el).attr('href');
        if (!href) return;
        let url=href;
        if (base) { try{url=new URL(href,base).href;}catch{} }
        links.push({url,text:clean($(el).text()).slice(0,500),rel:$(el).attr('rel')||null});
      });
      return {count:links.length,links};
    }
  },
  {
    name:'html-metadata', route:'/html/meta', price:'$0.0005', priceUsd:0.0005,
    description:'Extract title, meta description, canonical URL, robots directives, Open Graph fields and JSON-LD from supplied HTML.',
    tags:['html','metadata','open-graph','json-ld','web'],
    inputSchema:{
      type:'object',
      properties:{html:{type:'string',maxLength:500000},base_url:{type:'string',maxLength:8192}},
      required:['html'],
      additionalProperties:false
    },
    example:{html:'<title>Example</title><meta name="description" content="Demo">'},
    run: async input => {
      const html=boundedText(input?.html,'html');
      const base=typeof input?.base_url==='string'&&input.base_url?input.base_url:undefined;
      const $=cheerio.load(html);
      const meta={};
      $('meta').each((_,el)=>{
        const key=$(el).attr('property')||$(el).attr('name');
        const val=$(el).attr('content');
        if (key&&val&&Object.keys(meta).length<200) meta[key]=val;
      });
      const canonicalRaw=$('link[rel="canonical"]').attr('href');
      let canonical=canonicalRaw||null;
      if (canonicalRaw&&base) { try{canonical=new URL(canonicalRaw,base).href;}catch{} }
      const json_ld=[];
      $('script[type="application/ld+json"]').each((_,el)=>{ if(json_ld.length<20){try{json_ld.push(JSON.parse($(el).text()));}catch{}} });
      return {title:clean($('title').first().text())||null,canonical,meta,json_ld};
    }
  },
  {
    name:'slugify', route:'/text/slugify', price:'$0.0005', priceUsd:0.0005,
    description:'Convert text into a deterministic lowercase URL-safe slug.',
    tags:['text','slug','normalize','utility'],
    inputSchema:textSchema,
    example:{text:'Hello, World!'},
    run: async input => {
      const text=boundedText(input?.text);
      return {result:text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,2000)};
    }
  }
];

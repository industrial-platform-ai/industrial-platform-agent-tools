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
    name:'hash', route:'/hash', price:'$0.0005', priceUsd:0.0005,
    description:'Compute SHA-256, SHA-512, SHA-1 or MD5 checksum for UTF-8 text and return hex plus Base64 digests. Use for compute sha256 checksum, integrity verification, content fingerprints, cache keys, deduplication and agent pipelines.',
    tags:['hash','sha256','sha512','sha1','md5','checksum','encoding','crypto','utility'],
    inputSchema:{
      type:'object',
      properties:{
        text:{type:'string',maxLength:250000,description:'Text to hash.'},
        algo:{type:'string',enum:['sha256','sha512','sha1','md5'],description:'Hash algorithm; defaults to sha256.'}
      },
      required:['text'],
      additionalProperties:false
    },
    example:{text:'hello world',algo:'sha256'},
    run: async input => {
      const text=boundedText(input?.text);
      const algo=input?.algo||'sha256';
      const h=createHash(algo).update(text,'utf8');
      const bytes=h.digest();
      return {algo,hex:bytes.toString('hex'),base64:bytes.toString('base64')};
    }
  },
  {
    name:'base64-encode', route:'/base64/encode', price:'$0.0005', priceUsd:0.0005,
    description:'Base64 encode UTF-8 text into a standard Base64 string for API payloads, binary-safe transport, data conversion and agent workflows.',
    tags:['base64','encode','conversion','utility'],
    inputSchema:textSchema,
    example:{text:'hello world'},
    run: async input => ({encoding:'base64',result:Buffer.from(boundedText(input?.text),'utf8').toString('base64')})
  },
  {
    name:'base64-decode', route:'/base64/decode', price:'$0.0005', priceUsd:0.0005,
    description:'Base64 decode a standard Base64 string into UTF-8 text for API payload recovery, data conversion and agent workflows.',
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
    description:'Extract clean normalized text from a raw HTML document without network access. Use for HTML-to-text conversion, document text extraction, LLM context preparation and RAG ingestion.',
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
  },
  {
    name:'hmac', route:'/hmac', price:'$0.0005', priceUsd:0.0005,
    description:'Compute an HMAC for text using SHA-256 or SHA-512 for signatures, webhook verification and agent integrity checks.',
    tags:['hmac','hash','signature','sha256','sha512','utility'],
    inputSchema:{
      type:'object',
      properties:{
        text:{type:'string',maxLength:250000},
        key:{type:'string',maxLength:10000},
        algorithm:{type:'string',enum:['sha256','sha512']}
      },
      required:['text','key'],
      additionalProperties:false
    },
    example:{text:'hello world',key:'secret',algorithm:'sha256'},
    run: async input => {
      const text=boundedText(input?.text), key=boundedText(input?.key,'key');
      const algorithm=input?.algorithm||'sha256';
      const digest=(await import('node:crypto')).createHmac(algorithm,key).update(text,'utf8').digest('hex');
      return {algorithm,digest};
    }
  },
  {
    name:'jwt-decode', route:'/jwt/decode', price:'$0.0005', priceUsd:0.0005,
    description:'Decode JWT header and payload without verification for inspection, debugging and agent workflows.',
    tags:['jwt','decode','token','json','utility'],
    inputSchema:{type:'object',properties:{token:{type:'string',maxLength:200000}},required:['token'],additionalProperties:false},
    example:{token:'eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMjMifQ.'},
    run: async input => {
      const token=boundedText(input?.token,'token');
      const parts=token.split('.');
      if(parts.length!==3) throw Object.assign(new Error('token must have three JWT segments.'),{statusCode:400});
      const decode=(part)=>{
        const raw=Buffer.from(part.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8');
        try{return JSON.parse(raw);}catch{return raw;}
      };
      return {header:decode(parts[0]),payload:decode(parts[1]),signature_present:parts[2].length>0,verified:false};
    }
  },
  {
    name:'hex-encode', route:'/hex/encode', price:'$0.0005', priceUsd:0.0005,
    description:'Convert UTF-8 text to a hexadecimal string. Use as a hex string encoder or text-to-hex converter in deterministic agent pipelines.',
    tags:['hex','encode','conversion','utility'],
    inputSchema:textSchema,
    example:{text:'hello'},
    run: async input => ({encoding:'hex',result:Buffer.from(boundedText(input?.text),'utf8').toString('hex')})
  },
  {
    name:'hex-decode', route:'/hex/decode', price:'$0.0005', priceUsd:0.0005,
    description:'Convert a hexadecimal string back into UTF-8 text. Use as a hex string decoder or hex-to-text converter in deterministic agent pipelines.',
    tags:['hex','decode','conversion','utility'],
    inputSchema:{type:'object',properties:{value:{type:'string',maxLength:500000}},required:['value'],additionalProperties:false},
    example:{value:'68656c6c6f'},
    run: async input => {
      const value=boundedText(input?.value,'value').trim();
      if(!/^(?:[0-9a-fA-F]{2})*$/.test(value)) throw Object.assign(new Error('value must contain an even number of hexadecimal characters.'),{statusCode:400});
      return {encoding:'utf8',result:Buffer.from(value,'hex').toString('utf8')};
    }
  },
  {
    name:'base64', route:'/base64', price:'$0.0005', priceUsd:0.0005,
    description:'Base64 encode or decode UTF-8 text. Supports standard and URL-safe Base64 decoding. Use mode encode or decode.',
    tags:['base64','encode','decode','encoding','conversion','utility'],
    inputSchema:{
      type:'object',
      properties:{
        text:{type:'string',maxLength:250000,description:'Input text or Base64 value.'},
        mode:{type:'string',enum:['encode','decode'],description:'encode or decode; defaults to encode.'}
      },
      required:['text'],
      additionalProperties:false
    },
    example:{text:'hello',mode:'encode'},
    run: async input => {
      const text=boundedText(input?.text);
      const mode=input?.mode||'encode';
      if(mode==='decode'){
        const normalized=text.replace(/-/g,'+').replace(/_/g,'/').replace(/\s+/g,'');
        if(!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) throw Object.assign(new Error('text is not valid Base64.'),{statusCode:400});
        return {mode,result:Buffer.from(normalized,'base64').toString('utf8')};
      }
      return {mode,result:Buffer.from(text,'utf8').toString('base64')};
    }
  },
  {
    name:'url-encode-decode', route:'/url/code', price:'$0.0005', priceUsd:0.0005,
    description:'Percent-encode or decode text for URLs using URL-component semantics. Use mode encode or decode.',
    tags:['url','encode','decode','percent-encoding','conversion','utility'],
    inputSchema:{
      type:'object',
      properties:{
        text:{type:'string',maxLength:250000},
        mode:{type:'string',enum:['encode','decode']}
      },
      required:['text'],
      additionalProperties:false
    },
    example:{text:'a b&c',mode:'encode'},
    run: async input => {
      const text=boundedText(input?.text);
      const mode=input?.mode||'encode';
      try{return {mode,result:mode==='decode'?decodeURIComponent(text):encodeURIComponent(text)};}
      catch{throw Object.assign(new Error('Input cannot be URL-decoded.'),{statusCode:400});}
    }
  },
  {
    name:'multi-digest-checksum', route:'/checksum', price:'$0.0005', priceUsd:0.0005,
    description:'Compute MD5, SHA-1, SHA-256 and SHA-512 checksums for one UTF-8 string in a single call. Use for multi-hash verification, content fingerprints, integrity checks and deduplication.',
    tags:['checksum','hash','md5','sha1','sha256','sha512','integrity','utility'],
    inputSchema:{type:'object',properties:{data:{type:'string',maxLength:250000}},required:['data'],additionalProperties:false},
    example:{data:'hello world'},
    run: async input => {
      const data=boundedText(input?.data,'data');
      return {md5:createHash('md5').update(data).digest('hex'),sha1:createHash('sha1').update(data).digest('hex'),sha256:createHash('sha256').update(data).digest('hex'),sha512:createHash('sha512').update(data).digest('hex')};
    }
  },
  {
    name:'text-chunk', route:'/text/chunk', price:'$0.0005', priceUsd:0.0005,
    description:'Split document or text content into deterministic overlapping chunks for RAG ingestion, embeddings, vector indexing, retrieval pipelines and LLM context windows.',
    tags:['text','chunk','rag','embeddings','split','utility'],
    inputSchema:{
      type:'object',
      properties:{
        text:{type:'string',maxLength:500000},
        size:{type:'integer',minimum:50,maximum:50000},
        overlap:{type:'integer',minimum:0,maximum:10000}
      },
      required:['text'],
      additionalProperties:false
    },
    example:{text:'Long document text',size:800,overlap:100},
    run: async input => {
      const text=boundedText(input?.text);
      const size=Number.isInteger(input?.size)?input.size:800;
      const overlap=Number.isInteger(input?.overlap)?input.overlap:0;
      if(overlap>=size) throw Object.assign(new Error('overlap must be smaller than size.'),{statusCode:400});
      const chunks=[]; const step=size-overlap;
      for(let start=0;start<text.length&&chunks.length<10000;start+=step){
        chunks.push({index:chunks.length,start,end:Math.min(text.length,start+size),text:text.slice(start,start+size)});
        if(start+size>=text.length) break;
      }
      return {size,overlap,count:chunks.length,chunks};
    }
  }
];

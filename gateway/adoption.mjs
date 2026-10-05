const TIMEOUT_MS = 10000;

function escXml(text='') {
  return String(text)
    .replace(/&amp;/g,'&')
    .replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"')
    .replace(/&#39;/g,"'");
}

function stripCdata(text='') {
  return String(text).replace(/^<!\[CDATA\[/,'').replace(/\]\]>$/,'');
}

function tag(block,name) {
  const m=String(block).match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'));
  return m ? escXml(stripCdata(m[1]).trim()) : null;
}

async function fetchText(url, headers={}) {
  const res=await fetch(url,{
    headers:{'user-agent':'IndustrialPlatform-x402-AdoptionSearch/1.0','accept':'*/*',...headers},
    signal:AbortSignal.timeout(TIMEOUT_MS)
  });
  const text=await res.text();
  if(!res.ok) throw new Error('Upstream HTTP '+res.status+' from '+new URL(url).host);
  return text;
}

async function googleNews(query, limit) {
  const url='https://news.google.com/rss/search?q='+encodeURIComponent(query)+'&hl=en-US&gl=US&ceid=US:en';
  const xml=await fetchText(url,{'accept':'application/rss+xml,application/xml,text/xml'});
  const items=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,limit).map(m=>({
    source:'Google News',
    title:tag(m[1],'title'),
    url:tag(m[1],'link'),
    published_at:tag(m[1],'pubDate'),
    publisher:tag(tag(m[1],'source')||'','source') || tag(m[1],'source')
  }));
  return items;
}

async function githubRepos(query, limit) {
  const url='https://api.github.com/search/repositories?q='+encodeURIComponent(query)+'&sort=updated&order=desc&per_page='+Math.min(10,limit);
  const raw=await fetchText(url,{'accept':'application/vnd.github+json'});
  let data={};
  try{data=JSON.parse(raw);}catch{}
  return (data.items||[]).slice(0,limit).map(row=>({
    source:'GitHub',
    title:row.full_name,
    url:row.html_url,
    description:row.description||null,
    updated_at:row.updated_at||null,
    stars:row.stargazers_count??null
  }));
}

export const adoptionTools = [{
  name:'search-the-web-for-x402-adoption',
  route:'/x402/adoption-search',
  price:'$0.001',
  priceUsd:0.001,
  summary:'Search the web for x402 adoption',
  description:'Search the web for x402 adoption, x402 integrations, x402 agent payments, x402 ecosystem launches and machine-to-machine payment adoption. Built to satisfy recurring autonomous-agent research demand for current x402 adoption signals.',
  tags:['search the web for x402 adoption','x402 adoption','x402 search','x402 ecosystem','agent payments','machine payments','web search','research','current'],
  inputSchema:{
    type:'object',
    properties:{
      query:{type:'string',minLength:1,maxLength:200,description:'Search phrase. Defaults to x402 adoption.'},
      limit:{type:'integer',minimum:1,maximum:10,description:'Maximum results per source; default 5.'}
    },
    additionalProperties:false
  },
  example:{query:'x402 adoption',limit:5},
  run:async input=>{
    const query=String(input?.query||'x402 adoption').trim();
    const limit=Number.isInteger(input?.limit)?Math.min(10,Math.max(1,input.limit)):5;
    const [newsResult,githubResult]=await Promise.allSettled([
      googleNews(query,limit),
      githubRepos(query,limit)
    ]);
    const news=newsResult.status==='fulfilled'?newsResult.value:[];
    const github=githubResult.status==='fulfilled'?githubResult.value:[];
    const results=[...news,...github];
    return {
      status:'ready',
      query,
      searched_at:new Date().toISOString(),
      sources:['Google News RSS','GitHub public repository search'],
      count:results.length,
      results,
      source_status:{
        google_news:newsResult.status==='fulfilled'?'ok':String(newsResult.reason?.message||newsResult.reason),
        github:githubResult.status==='fulfilled'?'ok':String(githubResult.reason?.message||githubResult.reason)
      },
      repeat_policy:{
        mode:'scheduled',
        recommended_after_seconds:900,
        reason:'x402 launches, integrations and adoption signals change throughout the day; refresh every 15 minutes during active ecosystem monitoring.'
      },
      next_check:{recommended_after_seconds:900,request:{query,limit}}
    };
  }
}];

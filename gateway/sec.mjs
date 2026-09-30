const SEC_ORIGIN = 'https://data.sec.gov';
const SEC_WWW = 'https://www.sec.gov';
const SEC_USER_AGENT = process.env.SEC_USER_AGENT || 'IndustrialPlatform/1.0 art@naturalist.gallery';
const CACHE_MS = 6 * 60 * 60 * 1000;

let tickerCache = { at: 0, rows: [] };

async function secJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': SEC_USER_AGENT,
      'accept-encoding': 'gzip, deflate'
    },
    signal: AbortSignal.timeout(12000)
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  if (!response.ok || body === null) {
    throw Object.assign(new Error('SEC public-data request failed with HTTP ' + response.status), { statusCode: 502 });
  }
  return body;
}

function cik10(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits || digits.length > 10) throw Object.assign(new Error('CIK is invalid.'), { statusCode: 400 });
  return digits.padStart(10, '0');
}

async function tickerRows() {
  if (tickerCache.rows.length && Date.now() - tickerCache.at < CACHE_MS) return tickerCache.rows;
  const body = await secJson(SEC_WWW + '/files/company_tickers.json');
  const rows = Object.values(body).map(row => ({
    cik: cik10(row.cik_str),
    cik_number: Number(row.cik_str),
    ticker: String(row.ticker || '').toUpperCase(),
    title: row.title || null
  }));
  tickerCache = { at: Date.now(), rows };
  return rows;
}

async function identify(input) {
  const cikRaw = input?.cik;
  if (cikRaw !== undefined && cikRaw !== null && String(cikRaw).trim()) {
    const cik = cik10(cikRaw);
    const rows = await tickerRows();
    const row = rows.find(x => x.cik === cik);
    return row || { cik, cik_number: Number(cik), ticker: null, title: null };
  }
  const ticker = String(input?.ticker || '').trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,15}$/.test(ticker)) {
    throw Object.assign(new Error('ticker or cik is required.'), { statusCode: 400 });
  }
  const rows = await tickerRows();
  const row = rows.find(x => x.ticker === ticker);
  if (!row) throw Object.assign(new Error('Ticker was not found in the SEC company ticker mapping.'), { statusCode: 404 });
  return row;
}

function recentRows(submissions, company, { forms = [], limit = 20 } = {}) {
  const r = submissions?.filings?.recent || {};
  const n = Array.isArray(r.form) ? r.form.length : 0;
  const wanted = new Set(forms.map(x => x.toUpperCase()));
  const rows = [];
  for (let i = 0; i < n && rows.length < limit; i++) {
    const form = String(r.form?.[i] || '');
    if (wanted.size && !wanted.has(form.toUpperCase())) continue;
    const accession = r.accessionNumber?.[i] || null;
    const primary = r.primaryDocument?.[i] || null;
    const accessionCompact = accession ? accession.replace(/-/g, '') : null;
    const filingUrl = accessionCompact && primary
      ? `https://www.sec.gov/Archives/edgar/data/${company.cik_number}/${accessionCompact}/${primary}`
      : null;
    const indexUrl = accessionCompact
      ? `https://www.sec.gov/Archives/edgar/data/${company.cik_number}/${accessionCompact}/${accession}-index.htm`
      : null;
    rows.push({
      accession_number: accession,
      filing_date: r.filingDate?.[i] || null,
      report_date: r.reportDate?.[i] || null,
      acceptance_datetime: r.acceptanceDateTime?.[i] || null,
      act: r.act?.[i] || null,
      form,
      file_number: r.fileNumber?.[i] || null,
      film_number: r.filmNumber?.[i] || null,
      items: r.items?.[i] || null,
      primary_document: primary,
      primary_document_description: r.primaryDocDescription?.[i] || null,
      filing_url: filingUrl,
      index_url: indexUrl
    });
  }
  return rows;
}

const FACT_TAGS = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet'],
  net_income: ['NetIncomeLoss','ProfitLoss'],
  assets: ['Assets'],
  liabilities: ['Liabilities'],
  stockholders_equity: ['StockholdersEquity','StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  cash: ['CashAndCashEquivalentsAtCarryingValue','CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
  operating_income: ['OperatingIncomeLoss'],
  eps_diluted: ['EarningsPerShareDiluted'],
  operating_cash_flow: ['NetCashProvidedByUsedInOperatingActivities']
};

function chooseTag(facts, candidates) {
  const usgaap = facts?.facts?.['us-gaap'] || {};
  for (const tag of candidates) if (usgaap[tag]) return { tag, fact: usgaap[tag] };
  return null;
}

function chooseUnit(fact) {
  const units = fact?.units || {};
  if (units.USD) return ['USD', units.USD];
  if (units['USD/shares']) return ['USD/shares', units['USD/shares']];
  if (units.shares) return ['shares', units.shares];
  const first = Object.entries(units)[0];
  return first || [null, []];
}

function latestByForm(rows, form) {
  return rows
    .filter(x => String(x.form || '').toUpperCase() === form)
    .filter(x => x.val !== undefined && x.val !== null)
    .sort((a,b) => String(b.filed || '').localeCompare(String(a.filed || '')) || String(b.end || '').localeCompare(String(a.end || '')))[0] || null;
}

function normalizeFact(key, tagData) {
  if (!tagData) return { key, available:false };
  const [unit, rows] = chooseUnit(tagData.fact);
  const annual = latestByForm(rows, '10-K');
  const quarterly = latestByForm(rows, '10-Q');
  return {
    key,
    available:true,
    taxonomy:'us-gaap',
    tag:tagData.tag,
    label:tagData.fact.label || null,
    description:tagData.fact.description || null,
    unit,
    annual_latest: annual ? {
      value: annual.val, start: annual.start || null, end: annual.end || null,
      fiscal_year: annual.fy || null, fiscal_period: annual.fp || null,
      filed: annual.filed || null, accession_number: annual.accn || null, frame: annual.frame || null
    } : null,
    quarterly_latest: quarterly ? {
      value: quarterly.val, start: quarterly.start || null, end: quarterly.end || null,
      fiscal_year: quarterly.fy || null, fiscal_period: quarterly.fp || null,
      filed: quarterly.filed || null, accession_number: quarterly.accn || null, frame: quarterly.frame || null
    } : null
  };
}

const identitySchema = {
  type:'object',
  properties:{
    ticker:{type:'string',description:'US-listed company ticker, e.g. AAPL.'},
    cik:{type:['string','integer'],description:'SEC Central Index Key; ticker is optional when CIK is supplied.'}
  },
  additionalProperties:false,
  anyOf:[{required:['ticker']},{required:['cik']}]
};

export const secTools = [
  {
    name:'sec-company-lookup',
    route:'/sec/company',
    price:'$0.001',
    priceUsd:0.001,
    description:'Resolve a US-listed stock ticker to its SEC CIK and canonical company name using the SEC public company ticker mapping. Also accepts a CIK for reverse lookup when mapped.',
    tags:['sec','edgar','company','ticker','cik','lookup','stocks'],
    inputSchema:identitySchema,
    example:{ticker:'AAPL'},
    run:async input=>({source:'SEC EDGAR public data',...(await identify(input)),fetched_at:new Date().toISOString()})
  },
  {
    name:'sec-recent-filings',
    route:'/sec/filings',
    price:'$0.005',
    priceUsd:0.005,
    description:'Get recent SEC EDGAR filings for a public company by ticker or CIK, newest first, with form, filing/report dates, accession number, items, primary-document URL and filing-index URL. Filter by forms such as 10-K, 10-Q, 8-K, S-1 or DEF 14A.',
    tags:['sec','edgar','filings','10-k','10-q','8-k','company','stocks','public-data'],
    inputSchema:{
      type:'object',
      properties:{
        ticker:identitySchema.properties.ticker,
        cik:identitySchema.properties.cik,
        forms:{type:'array',items:{type:'string'},maxItems:20},
        limit:{type:'integer',minimum:1,maximum:50}
      },
      additionalProperties:false,
      anyOf:[{required:['ticker']},{required:['cik']}]
    },
    example:{ticker:'AAPL',forms:['10-K','10-Q','8-K'],limit:20},
    run:async input=>{
      const company=await identify(input);
      const submissions=await secJson(SEC_ORIGIN + '/submissions/CIK' + company.cik + '.json');
      const forms=Array.isArray(input?.forms)?input.forms.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()):[];
      const limit=Number.isInteger(input?.limit)?Math.min(50,Math.max(1,input.limit)):20;
      const filings=recentRows(submissions,company,{forms,limit});
      return {
        source:'SEC EDGAR submissions API',
        company,
        sic:submissions.sic || null,
        sic_description:submissions.sicDescription || null,
        fiscal_year_end:submissions.fiscalYearEnd || null,
        exchanges:submissions.exchanges || [],
        tickers:submissions.tickers || [],
        count:filings.length,
        filings,
        fetched_at:new Date().toISOString()
      };
    }
  },
  {
    name:'sec-key-financial-facts',
    route:'/sec/facts',
    price:'$0.008',
    priceUsd:0.008,
    description:'Get the latest annual and quarterly SEC XBRL values for key company facts: revenue, net income, assets, liabilities, equity, cash, operating income, diluted EPS and operating cash flow. Returns the exact us-gaap tag and filing metadata for traceability.',
    tags:['sec','edgar','xbrl','financials','fundamentals','revenue','income','stocks','public-data'],
    inputSchema:identitySchema,
    example:{ticker:'AAPL'},
    run:async input=>{
      const company=await identify(input);
      const facts=await secJson(SEC_ORIGIN + '/api/xbrl/companyfacts/CIK' + company.cik + '.json');
      const values={};
      for(const [key,candidates] of Object.entries(FACT_TAGS)) values[key]=normalizeFact(key,chooseTag(facts,candidates));
      return {
        source:'SEC EDGAR XBRL companyfacts API',
        company,
        entity_name:facts.entityName || company.title,
        facts:values,
        fetched_at:new Date().toISOString(),
        note:'Values are filing facts, not investment advice; exact taxonomy tags and filing metadata are returned for auditability.'
      };
    }
  }
];

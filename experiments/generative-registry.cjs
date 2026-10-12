// Generative service registry prototype: no network, payment or crawler side effects.
// Only explicitly approved handlers can be made live.
const HANDLERS = Object.freeze({
  "wallet.balance": { input: ["chain","address"], output: "balance", live: false },
  "chain.tx-status": { input: ["chain","txHash"], output: "transactionStatus", live: false },
  "web.markdown": { input: ["url"], output: "markdown", live: false },
  "web.change": { input: ["url","previousHash"], output: "changed", live: false }
});
const CHAINS = ["base","ethereum","arbitrum","optimism","polygon"];
const FORMATS = ["json","text"];
const MODES = ["single","batch"];
const VARIANTS = Object.keys(HANDLERS).length * CHAINS.length * FORMATS.length * MODES.length;
function assertInteger(n) { if (!Number.isSafeInteger(n) || n < 0 || n >= VARIANTS) throw new RangeError("invalid service id"); }
function definition(id) {
  assertInteger(id);
  const mode = MODES[id % MODES.length]; id = Math.floor(id / MODES.length);
  const format = FORMATS[id % FORMATS.length]; id = Math.floor(id / FORMATS.length);
  const chain = CHAINS[id % CHAINS.length]; id = Math.floor(id / CHAINS.length);
  const handlerId = Object.keys(HANDLERS)[id];
  const handler = HANDLERS[handlerId];
  return Object.freeze({ id: [handlerId,chain,format,mode].join(":"), handlerId, chain, format, mode,
    input: handler.input, output: handler.output, live: handler.live, version: 1 });
}
function page(offset=0,limit=20) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RangeError("invalid pagination");
  return Array.from({length:Math.max(0,Math.min(limit,VARIANTS-offset))},(_,i)=>definition(offset+i));
}
module.exports={HANDLERS,VARIANTS,definition,page};

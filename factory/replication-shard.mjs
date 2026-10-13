// Executed by a short-lived GitHub Actions worker. Child identities are pure math.
// Never launches a Railway container, payment, external crawler, or new cron.
import {mkdir,writeFile} from 'node:fs/promises';
import {safeExpansionReport} from '../gateway/replication.mjs';
const shard=Number(process.env.REPLICA_SHARD||'0');
const shards=Number(process.env.REPLICA_SHARDS||'4');
const cap=Number(process.env.REPLICA_SAMPLE_CAP||'16');
const report=safeExpansionReport({when:new Date(),shard,shards,cap});
await mkdir('factory/out',{recursive:true});
const filename='factory/out/replication-shard-'+shard+'.json';
await writeFile(filename,JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify({report_path:filename,...report},null,2)+'\n');

// Single-run batch planner. With trusted signed evidence and explicit opt-in,
// can stage an activation manifest; it NEVER triggers Railway or makes purchases.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {generateInventory,planBatch} from '../gateway/factory-batch-engine.mjs';

const args=new Map(process.argv.slice(2).map(v=>{
 const at=v.indexOf('=');
 return at<0?[v,'true']:[v.slice(0,at),v.slice(at+1)];
}));
function countOption(key,fallback){
 const raw=args.get(key);
 if(raw===undefined)return fallback;
 if(!/^[0-9]+$/.test(raw))throw Error('Invalid '+key);
 return Number(raw);
}
const count=countOption('--virtual-slots',1000000);
const sample=countOption('--sample',4096);
const start=countOption('--start',0);
const output=resolve('factory/out');
const target=resolve('gateway/factory-batch-active.json');
const active=JSON.parse(await readFile(target,'utf8'));
const evidenceFile=args.get('--evidence');
const portfolioFile=args.get('--portfolio');
const proofs=evidenceFile?JSON.parse(await readFile(resolve(evidenceFile),'utf8')):{};
const portfolio=portfolioFile?JSON.parse(await readFile(resolve(portfolioFile),'utf8')):null;
const inventory=generateInventory({virtualSlots:count,sampleLimit:sample,start});
const publicKey=process.env.FACTORY_ATTESTOR_ED25519_PUBLIC_KEY_PEM_B64||'';
const plan=planBatch({inventory,evidence:proofs,portfolio,active,publicKey,maxPerRun:countOption('--max-activate',1024)});
await mkdir(output,{recursive:true});
const report={generated_at:new Date().toISOString(),...plan};
await writeFile(resolve(output,'batch-plan.json'),JSON.stringify(report,null,2)+'\n');
if(args.has('--publish')){
 if(process.env.FACTORY_APPROVED_ACTIVATION!=='true')throw Error('Activation must be explicitly approved by operator in trusted runner');
 if(plan.proposed.length===0)throw Error('No independently attested, quality-validated profitable product qualifies');
 if(!publicKey)throw Error('Independent evidence public key is required');
 const tmp=target+'.staged-'+process.pid;
 await writeFile(tmp,JSON.stringify(plan.proposed_manifest,null,2)+'\n',{flag:'wx'});
 await rename(tmp,target);
 process.stdout.write('SIGNED_ACTIVATIONS_STAGED='+plan.proposed.length+'; CI review and deployment still required\n');
}
process.stdout.write(JSON.stringify({
 plan:'factory/out/batch-plan.json',virtual_slots:report.generated_virtual_slots,
 materialized:report.sampled_definitions,unique:report.unique_vetted_candidates,
 eligible_to_stage:report.proposed.length,existing_activated:report.active_count_before,
 staged:args.has('--publish')&&report.proposed.length>0,
 reason:report.proposed.length?'Candidate attestations passed; publishing still requires explicit approval':'No signed qualifying candidate evidence or capacity'
})+'\n');

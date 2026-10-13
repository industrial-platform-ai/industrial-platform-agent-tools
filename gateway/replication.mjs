// Deterministic, bounded parent-to-child service-definition replication.
// These are VIRTUAL IDENTITIES, never assertions of live endpoints or paid use.
// Every parent has one unique child per epoch: child = parent + 2**epoch.
// Materialization is explicitly capped; no network access, payments, deployments or new jobs.
export const REPLICATION_GENESIS_UTC = '2026-10-13T23:58:11Z';
export const MAX_EPOCH = 30;
export const MAX_SHARDS = 8;
export const MAX_SAMPLES_PER_SHARD = 16;
const LIMIT = 1n << BigInt(MAX_EPOCH);
function integer(value,label,min,max){
  if(!Number.isSafeInteger(value)||value<min||value>max)throw new RangeError(label+' out of bounds');
  return value;
}
export function epochAt(now=new Date()){
  const timestamp=now instanceof Date?now.getTime():new Date(now).getTime();
  if(!Number.isFinite(timestamp))throw new RangeError('Invalid clock');
  return Math.min(MAX_EPOCH, Math.max(0, Math.floor((timestamp-Date.parse(REPLICATION_GENESIS_UTC))/3600000)));
}
export function generation(epoch){
  integer(epoch,'epoch',0,MAX_EPOCH);
  const total=1n<<BigInt(epoch);
  return Object.freeze({
    epoch, virtual_total:total.toString(),
    virtual_new_this_epoch:epoch===0?'0':(total/2n).toString(),
    crossed_one_billion:total>=1_000_000_000n,
    paused:epoch===MAX_EPOCH,
    // Count of actual paid endpoints and active services is NOT inferred from this.
    active_services_verified_by_generator:0,
    definitions_materialized_by_generator:0,
    interpretation:'virtual service identity space, not launched services'
  });
}
export function childFromParent(parent, epoch){
  integer(epoch,'epoch',0,MAX_EPOCH-1);
  const id=typeof parent==='bigint'?parent:BigInt(parent);
  const range=1n<<BigInt(epoch);
  if(id<0n||id>=range)throw new RangeError('parent service ID not in current generation');
  const child=id+range;
  if(child>=LIMIT)throw new RangeError('replication paused at billion-identity safety cap');
  return Object.freeze({parent_id:id.toString(),child_id:child.toString(),created_at_epoch:epoch+1,
    state:'virtual_only',infrastructure_created:false,live_service:false});
}
export function shardPlan(epoch,shardIndex,shards,sampleLimit=MAX_SAMPLES_PER_SHARD){
  integer(epoch,'epoch',0,MAX_EPOCH);
  integer(shards,'shards',1,MAX_SHARDS);
  integer(shardIndex,'shardIndex',0,shards-1);
  integer(sampleLimit,'sampleLimit',0,MAX_SAMPLES_PER_SHARD);
  if(epoch===0)return {epoch,shardIndex,shards,scheduled_parent_count:'0',
    sampled_parents:[],virtual_children_possible:'0',paused:false,actual_deployments:0};
  const parents=1n<<BigInt(epoch-1);
  const first=BigInt(shardIndex), stride=BigInt(shards);
  const count=first>=parents?0n:1n+(parents-1n-first)/stride;
  const cap=count<BigInt(sampleLimit)?Number(count):sampleLimit;
  const samples=Array.from({length:cap},(_,i)=>childFromParent(first+BigInt(i)*stride,epoch-1));
  return Object.freeze({epoch,shardIndex,shards,scheduled_parent_count:count.toString(),
    sampled_parents:samples,virtual_children_possible:count.toString(),
    sampled_children:samples.length,paused:epoch===MAX_EPOCH,actual_deployments:0,
    workload_policy:'Only bounded samples are computed, theoretical children are not activated'});
}
export function safeExpansionReport({when=new Date(),shard=0,shards=4,cap=16}={}){
  const epoch=epochAt(when);
  return Object.freeze({
    genesis_utc:REPLICATION_GENESIS_UTC,checked_at:new Date(when).toISOString(),
    projected:generation(epoch),shard:shardPlan(epoch,shard,shards,cap),
    threshold:LIMIT.toString(),live_service_spawns:0,wallet_operations:0,
    third_party_probes:0,
    protection:'No actual service deployment without separate validated demand and cost gates'
  });
}

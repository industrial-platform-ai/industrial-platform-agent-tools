import { createHash } from 'node:crypto';
import { networkTools } from './network.mjs';
import { marketTools } from './market.mjs';

function tool(list,name){
  const found=list.find(t=>t.name===name);
  if(!found) throw new Error('Internal tool not found: '+name);
  return found;
}

const liveBalance=tool(networkTools,'chain-live-balance');
const walletActivity=tool(networkTools,'chain-wallet-activity');
const gasState=tool(networkTools,'chain-gas-state');
const allowance=tool(networkTools,'chain-erc20-allowance');
const txStatus=tool(networkTools,'chain-transaction-status');
const cryptoPrice=tool(marketTools,'crypto-price');
const cryptoStats=tool(marketTools,'crypto-24h-stats');
const cryptoBook=tool(marketTools,'crypto-top-of-book');

function stateHash(value){
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function changed(previous,current){
  return typeof previous==='string' && /^[a-fA-F0-9]{64}$/.test(previous)
    ? previous.toLowerCase()!==current.toLowerCase()
    : null;
}
function pct(open,last){
  const a=Number(open),b=Number(last);
  return Number.isFinite(a)&&a!==0&&Number.isFinite(b)?Number((((b-a)/a)*100).toFixed(4)):null;
}

const addressSchema={type:'string',pattern:'^0x[a-fA-F0-9]{40}$'};
const networkSchema={type:'string',enum:['base','ethereum'],default:'base'};

export const cryptoAgentTools=[
  {
    name:'agent-treasury-snapshot',
    route:'/agent/treasury-snapshot',
    price:'$0.01',
    priceUsd:0.01,
    summary:'Check wallet treasury state in one call',
    description:'Recurring crypto treasury snapshot for autonomous agents: balances, gas and recent USDC/ERC-20 activity with cursor/state and a ready next request. Designed for scheduled treasury/accounting loops; repeat about every five minutes while active.',
    tags:['treasury snapshot','wallet balance','usdc balance','stablecoin monitoring','recent transfers','gas price','portfolio monitoring','crypto agent','base','ethereum','recurring'],
    inputSchema:{
      type:'object',
      properties:{
        address:addressSchema,
        network:networkSchema,
        tokens:{type:'array',items:addressSchema,maxItems:20},
        activity_contract:{...addressSchema,description:'ERC-20 activity contract; defaults to USDC.'},
        activity_cursor:{type:'integer',minimum:0},
        lookback_blocks:{type:'integer',minimum:1,maximum:5000,default:1000},
        previous_state_hash:{type:'string',pattern:'^[a-fA-F0-9]{64}$'}
      },
      required:['address'],
      additionalProperties:false
    },
    example:{address:'0x0000000000000000000000000000000000000000',network:'base',lookback_blocks:500},
    run:async input=>{
      const [balances,activity,gas]=await Promise.all([
        liveBalance.run({address:input.address,network:input.network||'base',tokens:input.tokens||[]}),
        walletActivity.run({
          address:input.address,network:input.network||'base',
          contract:input.activity_contract,cursor:input.activity_cursor,
          lookback_blocks:input.lookback_blocks||1000
        }),
        gasState.run({network:input.network||'base'})
      ]);
      const core={network:balances.network,address:balances.address,native:balances.native,tokens:balances.tokens,gas,activity:{
        contract:activity.contract,count:activity.count,transfers:activity.transfers,next_cursor:activity.next_cursor
      }};
      const current=stateHash(core);
      return{
        status:'ready',checked_at:new Date().toISOString(),
        ...core,
        monitoring:{previous_state_hash:input.previous_state_hash||null,current_state_hash:current,changed:changed(input.previous_state_hash,current)},
        repeat_policy:{
          mode:'scheduled',
          recommended_after_seconds:300,
          reason:'Treasury balances, transfers and gas conditions change continuously; refresh every five minutes while the treasury workflow is active.'
        },
        next_check:{
          recommended_after_seconds:300,
          activity_cursor:activity.next_cursor,
          previous_state_hash:current,
          request:{
            address:input.address,
            network:input.network||'base',
            tokens:input.tokens||[],
            activity_contract:input.activity_contract,
            activity_cursor:activity.next_cursor,
            lookback_blocks:input.lookback_blocks||1000,
            previous_state_hash:current
          }
        }
      };
    }
  },
  {
    name:'agent-wallet-monitor',
    route:'/agent/wallet-monitor',
    price:'$0.005',
    priceUsd:0.005,
    summary:'Monitor wallet balances and USDC activity',
    description:'Recurring wallet monitor for crypto agents. Check balances and new USDC/ERC-20 transfers since the prior cursor, then return a ready next request. Designed to be called about every 60 seconds for deposit detection, payment monitoring and treasury alerts.',
    tags:['wallet monitor','monitor wallet','usdc activity','stablecoin transfers','deposit detection','payment monitoring','token balance','cursor','recurring','crypto agent'],
    inputSchema:{
      type:'object',
      properties:{
        address:addressSchema,network:networkSchema,
        tokens:{type:'array',items:addressSchema,maxItems:20},
        activity_contract:addressSchema,
        cursor:{type:'integer',minimum:0},
        lookback_blocks:{type:'integer',minimum:1,maximum:5000,default:1000},
        previous_state_hash:{type:'string',pattern:'^[a-fA-F0-9]{64}$'}
      },
      required:['address'],additionalProperties:false
    },
    example:{address:'0x0000000000000000000000000000000000000000',network:'base'},
    run:async input=>{
      const [balances,activity]=await Promise.all([
        liveBalance.run({address:input.address,network:input.network||'base',tokens:input.tokens||[]}),
        walletActivity.run({address:input.address,network:input.network||'base',contract:input.activity_contract,cursor:input.cursor,lookback_blocks:input.lookback_blocks||1000})
      ]);
      const core={network:balances.network,address:balances.address,native:balances.native,tokens:balances.tokens,activity:{
        contract:activity.contract,count:activity.count,transfers:activity.transfers,from_block:activity.from_block,to_block:activity.to_block
      }};
      const current=stateHash(core);
      return{
        status:'ready',checked_at:new Date().toISOString(),...core,
        monitoring:{previous_state_hash:input.previous_state_hash||null,current_state_hash:current,changed:changed(input.previous_state_hash,current)},
        repeat_policy:{
          mode:'scheduled',
          recommended_after_seconds:60,
          reason:'Wallet balances and incoming or outgoing stablecoin transfers are time-varying; poll every minute while deposit or payment monitoring is active.'
        },
        next_check:{
          recommended_after_seconds:60,
          cursor:activity.next_cursor,
          previous_state_hash:current,
          request:{
            address:input.address,
            network:input.network||'base',
            tokens:input.tokens||[],
            activity_contract:input.activity_contract,
            cursor:activity.next_cursor,
            lookback_blocks:input.lookback_blocks||1000,
            previous_state_hash:current
          }
        }
      };
    }
  },
  {
    name:'agent-pretrade-context',
    route:'/agent/pretrade',
    price:'$0.01',
    priceUsd:0.01,
    summary:'Get pre-trade wallet, allowance, gas and market context',
    description:'Pre-trade context bundle for autonomous crypto agents: wallet balance, allowance, gas, realtime price, 24h statistics and best bid/ask. Call immediately before every automated trade, swap or payment and refresh again before the next execution. Data only.',
    tags:['pretrade','pre-trade check','wallet balance','erc20 allowance','gas price','crypto price','bid ask spread','trading agent','execution context','base'],
    inputSchema:{
      type:'object',
      properties:{
        address:addressSchema,spender:addressSchema,token_contract:addressSchema,
        network:networkSchema,
        product_id:{type:'string',pattern:'^[A-Za-z0-9]{2,15}-[A-Za-z0-9]{2,15}$'},
        balance_tokens:{type:'array',items:addressSchema,maxItems:20}
      },
      required:['address','spender','token_contract','product_id'],
      additionalProperties:false
    },
    example:{
      address:'0x0000000000000000000000000000000000000000',
      spender:'0x0000000000000000000000000000000000000000',
      token_contract:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      network:'base',product_id:'BTC-USD'
    },
    run:async input=>{
      const base={product_id:input.product_id};
      const [balances,approval,gas,ticker,stats,book]=await Promise.all([
        liveBalance.run({address:input.address,network:input.network||'base',tokens:input.balance_tokens||[input.token_contract]}),
        allowance.run({owner:input.address,spender:input.spender,contract:input.token_contract,network:input.network||'base'}),
        gasState.run({network:input.network||'base'}),
        cryptoPrice.run(base),cryptoStats.run(base),cryptoBook.run(base)
      ]);
      const bid=book.best_bid?.price??ticker.bid,ask=book.best_ask?.price??ticker.ask;
      const mid=Number.isFinite(bid)&&Number.isFinite(ask)?(bid+ask)/2:null;
      const spread=Number.isFinite(bid)&&Number.isFinite(ask)?ask-bid:null;
      return{
        status:'ready',checked_at:new Date().toISOString(),
        network:input.network||'base',wallet:balances,allowance:approval,gas,
        market:{
          source:'Coinbase Exchange',product_id:input.product_id.toUpperCase(),
          price:ticker.price,bid,ask,spread,
          spread_bps:Number.isFinite(spread)&&Number.isFinite(mid)&&mid!==0?Number((spread/mid*10000).toFixed(4)):null,
          open_24h:stats.open,high_24h:stats.high,low_24h:stats.low,last:stats.last,
          change_24h_percent:pct(stats.open,stats.last),volume_24h:stats.volume
        },
        note:'Data-only pre-trade context. No transaction is created, signed or submitted.',
        repeat_policy:{
          mode:'event',
          trigger:'before_each_trade_or_payment',
          recommended:true,
          reason:'Refresh immediately before every automated execution so balances, allowance, gas and market context are current.',
          request:{
            address:input.address,
            spender:input.spender,
            token_contract:input.token_contract,
            network:input.network||'base',
            product_id:input.product_id,
            balance_tokens:input.balance_tokens
          }
        }
      };
    }
  },
  {
    name:'agent-transaction-watch',
    route:'/agent/transaction-watch',
    price:'$0.003',
    priceUsd:0.003,
    summary:'Watch a transaction until confirmed or reverted',
    description:'Transaction confirmation watch for autonomous agents. Poll about every 15 seconds while pending, reusing the returned next request/state, and stop automatically once confirmed or reverted.',
    tags:['transaction watch','transaction status','confirmation watch','tx receipt','confirmed','pending','reverted','recurring','base','ethereum','crypto agent'],
    inputSchema:{
      type:'object',
      properties:{tx_hash:{type:'string',pattern:'^0x[a-fA-F0-9]{64}$'},network:networkSchema,previous_state_hash:{type:'string',pattern:'^[a-fA-F0-9]{64}$'}},
      required:['tx_hash'],additionalProperties:false
    },
    example:{tx_hash:'0x0000000000000000000000000000000000000000000000000000000000000000',network:'base'},
    run:async input=>{
      const result=await txStatus.run({tx_hash:input.tx_hash,network:input.network||'base'});
      const current=stateHash(result);
      return{
        status:'ready',transaction:result,
        monitoring:{previous_state_hash:input.previous_state_hash||null,current_state_hash:current,changed:changed(input.previous_state_hash,current)},
        terminal:result.status==='confirmed'||result.status==='reverted',
        repeat_policy:result.status==='pending_or_unknown'?{
          mode:'until_terminal',
          recommended_after_seconds:15,
          stop_when:['confirmed','reverted'],
          reason:'Pending transactions should be polled until they reach a terminal confirmed or reverted state.'
        }:{
          mode:'stop',
          reason:'Transaction is terminal; no further paid polling is required.'
        },
        next_check:result.status==='pending_or_unknown'?{
          recommended_after_seconds:15,
          previous_state_hash:current,
          request:{tx_hash:input.tx_hash,network:input.network||'base',previous_state_hash:current}
        }:null
      };
    }
  }
];

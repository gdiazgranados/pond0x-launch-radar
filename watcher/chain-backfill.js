const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const DISTRIBUTOR = 'AYg4dKoZJudVkD7Eu3ZaJjkzfoaATUqfiv8w8pS53opT';
const UPSTREAM = 'BbMgFxZGVq5x6WC1yFeVzgtyckMZgj5FjPwdppMtShf';
const REWARD_WALLET = '1orFCnFfgwPzSgUaoK6Wr3MjgXZ7mtk8NGz9Hh4iWWL';
const WPOND_MINT = '3JgFwoYV74f6LwWjQWnr3YDPFnmBdwQfNyubv99jqUoq';

const dataDir = path.join(__dirname, '..', 'public', 'data');
const baselineFile = path.join(dataDir, 'chain-baseline.json');

const PAGES = Math.max(1, Math.min(20, Number(process.env.CHAIN_BACKFILL_PAGES || 8)));
const LIMIT = 100;
const SLEEP_MS = 650;
const CORRELATION_WINDOW_SECONDS = 300;

const sleep = ms => new Promise(r=>setTimeout(r,ms));
const n = v => { const x=Number(v||0); return Number.isFinite(x)?x:0; };
const round=(v,d=3)=>{const p=10**d;return Math.round(n(v)*p)/p;};

function median(values) {
  const xs=values.map(n).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!xs.length)return null;
  const m=Math.floor(xs.length/2);
  return xs.length%2?xs[m]:(xs[m-1]+xs[m])/2;
}
function stdDev(values){
  const xs=values.map(n).filter(Number.isFinite);
  if(xs.length<2)return 0;
  const avg=xs.reduce((a,x)=>a+x,0)/xs.length;
  return Math.sqrt(xs.reduce((a,x)=>a+(x-avg)**2,0)/xs.length);
}

async function fetchPage(address,before){
  if(!HELIUS_API_KEY)throw new Error('HELIUS_API_KEY is missing');
  const q=new URLSearchParams({'api-key':HELIUS_API_KEY,limit:String(LIMIT)});
  if(before)q.set('before',before);
  const url=`https://api.helius.xyz/v0/addresses/${address}/transactions?${q.toString()}`;
  const res=await fetch(url,{headers:{accept:'application/json'}});
  if(!res.ok)throw new Error(`Helius ${address.slice(0,6)} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchPaged(address){
  const all=[]; let before=null;
  for(let page=0;page<PAGES;page++){
    const rows=await fetchPage(address,before);
    if(!Array.isArray(rows)||!rows.length)break;
    all.push(...rows);
    before=rows[rows.length-1]?.signature;
    if(rows.length<LIMIT||!before)break;
    await sleep(SLEEP_MS);
  }
  return all;
}

function extract(txs){
  const out=[];
  for(const tx of Array.isArray(txs)?txs:[]){
    for(const t of Array.isArray(tx.tokenTransfers)?tx.tokenTransfers:[]){
      if(t.mint!==WPOND_MINT)continue;
      out.push({
        signature:tx.signature,timestamp:n(tx.timestamp),
        from:t.fromUserAccount||t.fromTokenAccount||'',
        to:t.toUserAccount||t.toTokenAccount||'',
        amount:n(t.tokenAmount),source:tx.source||'UNKNOWN'
      });
    }
  }
  return out;
}

function buildCycles(funding,claims){
  const f=[...funding].sort((a,b)=>a.timestamp-b.timestamp);
  const c=[...claims].sort((a,b)=>a.timestamp-b.timestamp);
  const cycles=[];
  for(let i=0;i<f.length;i++){
    const fe=f[i], end=Math.min(f[i+1]?.timestamp||Infinity,fe.timestamp+CORRELATION_WINDOW_SECONDS);
    const cc=c.filter(x=>x.timestamp>=fe.timestamp&&x.timestamp<end);
    cycles.push({
      fundingTimestamp:fe.timestamp,
      correlated:cc.length>0,
      firstClaimDelaySeconds:cc.length?Math.min(...cc.map(x=>x.timestamp-fe.timestamp)):null,
      claimCount:cc.length
    });
  }
  return cycles;
}

async function main(){
  await fs.ensureDir(dataDir);
  console.log(`Backfill: ${PAGES} pages/address x ${LIMIT} tx max`);

  const distributorTxs=await fetchPaged(DISTRIBUTOR);
  await sleep(SLEEP_MS);
  const upstreamTxs=await fetchPaged(UPSTREAM);

  const distributorOutflows = extract(distributorTxs)
    .filter(
      x =>
        x.from === DISTRIBUTOR &&
        x.to &&
        x.to !== DISTRIBUTOR
    );

  const rewardWalletTransfers = distributorOutflows
    .filter(x => x.to === REWARD_WALLET);

  const externalClaims = distributorOutflows
    .filter(x => x.to !== REWARD_WALLET);

  const funding=extract(upstreamTxs)
    .filter(x=>x.from===UPSTREAM&&x.to===DISTRIBUTOR);

  const cycles=buildCycles(funding,rewardWalletTransfers);
  const correlated=cycles.filter(x=>x.correlated);
  const delays=correlated.map(x=>x.firstClaimDelaySeconds).filter(x=>x!==null);

  const chronological=[...funding].sort((a,b)=>a.timestamp-b.timestamp);
  const cadence=[];
  for(let i=1;i<chronological.length;i++)cadence.push(chronological[i].timestamp-chronological[i-1].timestamp);

  const medCad=median(cadence), sd=stdDev(cadence);

  const baseline={
    generatedAt:new Date().toISOString(),
    version:'1.0.0',
    pagesPerAddress:PAGES,
    distributorTransactionsFetched:distributorTxs.length,
    upstreamTransactionsFetched:upstreamTxs.length,
    distributorOutflowsFound: distributorOutflows.length,
    rewardWalletTransfersFound: rewardWalletTransfers.length,
    externalClaimsFound: externalClaims.length,
    fundingEventsFound:funding.length,
    cyclesAnalyzed:cycles.length,
    correlatedCycles:correlated.length,
    correlationRatePct:cycles.length?round(correlated.length/cycles.length*100,1):0,
    firstClaimDelaySeconds:delays,
    fundingCadenceSeconds:cadence,
    summary:{
      medianFirstClaimDelaySeconds:median(delays),
      medianFundingCadenceSeconds:medCad,
      fundingCadenceStdDevSeconds:round(sd,1),
      fundingCadenceCV:medCad?round(sd/medCad,3):null
    }
  };

  await fs.writeJson(baselineFile,baseline,{spaces:2});
  console.log(`Baseline: ${cycles.length} cycles | ${correlated.length} correlated | rate=${baseline.correlationRatePct}% | median cadence=${baseline.summary.medianFundingCadenceSeconds}s`);
}

main().catch(e=>{console.error('chain-backfill failed:',e);process.exit(1);});

const fs=require('fs-extra'); const path=require('path'); require('dotenv').config();
const TOKEN=process.env.TELEGRAM_TOKEN, CHAT=process.env.TELEGRAM_CHAT_ID;
const dataDir=path.join(__dirname,'..','public','data');
const chainFile=path.join(dataDir,'chain-intelligence.json'); const stateFile=path.join(dataDir,'chain-notify-state.json');
function esc(s){
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function fmt(n){return Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2})}
async function send(text){if(!TOKEN||!CHAT){console.log('Telegram credentials missing');return false} const r=await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:CHAT,text,parse_mode:'HTML',disable_web_page_preview:true})}); if(!r.ok) throw new Error(await r.text()); return true}
async function main(){
 if(!await fs.pathExists(chainFile))return; const c=await fs.readJson(chainFile); let prev={}; try{prev=await fs.readJson(stateFile)}catch{};
  const prevObservedAt=prev.observedAt?new Date(prev.observedAt).getTime():0;
  const prevAgeMinutes=prevObservedAt?(Date.now()-prevObservedAt)/60000:Infinity;
  const prevIsFresh=prevAgeMinutes>=0 && prevAgeMinutes<=15;
  
  if(!prevIsFresh){
    prev={
      lastSentAt:prev.lastSentAt||null
    };
  }
 const w=c.windows?.['5m']||{}, p=c.predictor||{}, a=c.cycleAnalytics||{}, m=c.patternMatch||{}; const now=Date.now(); const lastSent=prev.lastSentAt?new Date(prev.lastSentAt).getTime():0; const mins=(now-lastSent)/60000;
 const resumed=(prev.activityState==='QUIET'||prev.activityState==='COOLING') && w.rewards>0;
 const spike=w.rewards>=5 && (c.claimVelocityPct>=100 || c.volumeVelocityPct>=100);
 const funding=!!c.fundingDetected && !prev.fundingDetected;
 const cycle=a.cycleSignal==='DISTRIBUTION_CYCLE_DETECTED' && prev.cycleSignal!=='DISTRIBUTION_CYCLE_DETECTED';
 const fundingWindow=p.status==='IN_FUNDING_WINDOW' && prev.predictorStatus!=='IN_FUNDING_WINDOW' && ['HIGH','VERY HIGH'].includes(a.cadenceConfidence);
 const patternCross=Number(m.historicalPatternMatchPct||0)>=80 && Number(prev.patternMatchPct||0)<80 && !!m.liveEvidence;
 const periodic=w.rewards>0 && mins>=30;
 const shouldSend=resumed||spike||funding||cycle||fundingWindow||patternCross||periodic;
 const reason=resumed?'CLAIM ACTIVITY RESUMED':spike?'REWARD FLOW SPIKE':funding?'DISTRIBUTOR FUNDING DETECTED':cycle?'DISTRIBUTION CYCLE DETECTED':fundingWindow?'EXPECTED FUNDING WINDOW':patternCross?'HIGH HISTORICAL PATTERN MATCH':'30-MIN ACTIVITY SUMMARY';
 const prediction=p.nextFundingExpectedAt?`\n\n🧠 <b>Cycle Intelligence</b>\nCadence confidence: <b>${esc(a.cadenceConfidence||'LOW')}</b>\nClaim-after-funding: <b>${fmt(a.claimAfterFundingProbabilityPct)}%</b>\nAutomation confidence: <b>${fmt(a.automationConfidence)}/100</b>\nPredictor: <b>${esc(p.status||'N/A')}</b>\nNext funding estimate: <b>${esc(p.nextFundingExpectedAt)}</b>`:'';
 const match=Number.isFinite(Number(m.historicalPatternMatchPct))?`\n\n🧬 <b>Historical Pattern Match</b>\nMatch: <b>${fmt(m.historicalPatternMatchPct)}%</b>\nStatus: <b>${esc(m.status||'N/A')}</b>\nModel confidence: <b>${esc(m.confidence||'LOW')}</b>\nLive trigger present: <b>${m.liveEvidence?'YES':'NO'}</b>`:'';
 const msg=`⛓️ <b>POND0X RADAR — ${reason}</b>\n\n⛏️ <b>Last 5 minutes</b>\nRewards: <b>${fmt(w.rewards)}</b>\nwPOND distributed: <b>${fmt(w.wpondDistributed)}</b>\nUnique recipients: <b>${fmt(w.uniqueRecipients)}</b>\nAvg reward: <b>${fmt(w.avgReward)}</b>\nLargest: <b>${fmt(w.largestReward)}</b>\n\n📈 Claim velocity: <b>${c.claimVelocityPct>=0?'+':''}${fmt(c.claimVelocityPct)}%</b>\n💧 Volume velocity: <b>${c.volumeVelocityPct>=0?'+':''}${fmt(c.volumeVelocityPct)}%</b>\n💰 Distributor funding: <b>${c.fundingDetected?'DETECTED':'not detected'}</b>\n🔗 Chain confirmation: <b>${fmt(c.chainConfirmationScore)}/100</b>\n🔥 Activity: <b>${esc(c.activityState)}</b>${prediction}${match}\n\n<i>Statistical on-chain intelligence. Pattern Match is similarity to observed historical cycles, not a probability or guarantee of a claim or launch.</i>`;
 let lastSentAt=prev.lastSentAt||null;

if(shouldSend){
  if(await send(msg)){
    lastSentAt=new Date().toISOString();
    console.log('Chain alert sent');
  }
}else{
  console.log('No material chain alert');
}

await fs.writeJson(stateFile,{
  observedAt:new Date().toISOString(),
  lastSentAt,
  activityState:c.activityState,
  fundingDetected:c.fundingDetected,
  rewards5m:w.rewards,
  volume5m:w.wpondDistributed,
  cycleSignal:a.cycleSignal,
  predictorStatus:p.status,
  patternMatchPct:m.historicalPatternMatchPct,
  patternMatchStatus:m.status
},{spaces:2});
}
main().catch(e=>{console.error('chain-notify failed:',e);process.exit(1)});

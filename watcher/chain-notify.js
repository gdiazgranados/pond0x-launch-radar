const fs=require('fs-extra'); const path=require('path'); require('dotenv').config();
const TOKEN=process.env.TELEGRAM_TOKEN, CHAT=process.env.TELEGRAM_CHAT_ID;
const dataDir=path.join(__dirname,'..','public','data');
const chainFile=path.join(dataDir,'chain-intelligence.json'); const stateFile=path.join(dataDir,'chain-last-alert.json');
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function fmt(n){return Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2})}
async function send(text){if(!TOKEN||!CHAT){console.log('Telegram credentials missing');return false} const r=await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:CHAT,text,parse_mode:'HTML',disable_web_page_preview:true})}); if(!r.ok) throw new Error(await r.text()); return true}
async function main(){if(!await fs.pathExists(chainFile))return; const c=await fs.readJson(chainFile); let prev={}; try{prev=await fs.readJson(stateFile)}catch{};
 const w=c.windows?.['5m']||{}; const now=Date.now(); const lastSent=prev.sentAt?new Date(prev.sentAt).getTime():0; const mins=(now-lastSent)/60000;
 const resumed=(prev.activityState==='QUIET'||prev.activityState==='COOLING') && w.rewards>0;
 const spike=w.rewards>=5 && (c.claimVelocityPct>=100 || c.volumeVelocityPct>=100);
 const funding=!!c.fundingDetected && !prev.fundingDetected;
 const periodic=w.rewards>0 && mins>=30;
 if(!(resumed||spike||funding||periodic)){console.log('No material chain alert');return}
 const reason=resumed?'CLAIM ACTIVITY RESUMED':spike?'REWARD FLOW SPIKE':funding?'DISTRIBUTOR FUNDING DETECTED':'30-MIN ACTIVITY SUMMARY';
 const msg=`⛓️ <b>POND0X RADAR — ${reason}</b>\n\n⛏️ <b>Last 5 minutes</b>\nRewards: <b>${fmt(w.rewards)}</b>\nwPOND distributed: <b>${fmt(w.wpondDistributed)}</b>\nUnique recipients: <b>${fmt(w.uniqueRecipients)}</b>\nAvg reward: <b>${fmt(w.avgReward)}</b>\nLargest: <b>${fmt(w.largestReward)}</b>\n\n📈 Claim velocity: <b>${c.claimVelocityPct>=0?'+':''}${fmt(c.claimVelocityPct)}%</b>\n💧 Volume velocity: <b>${c.volumeVelocityPct>=0?'+':''}${fmt(c.volumeVelocityPct)}%</b>\n💰 Distributor funding: <b>${c.fundingDetected?'DETECTED':'not detected'}</b>\n🔗 Chain confirmation: <b>${fmt(c.chainConfirmationScore)}/100</b>\n🔥 Activity: <b>${esc(c.activityState)}</b>\n\n<i>Aggregated on-chain intelligence — individual transfers suppressed to reduce noise.</i>`;
 if(await send(msg)){await fs.writeJson(stateFile,{sentAt:new Date().toISOString(),activityState:c.activityState,fundingDetected:c.fundingDetected,rewards5m:w.rewards,volume5m:w.wpondDistributed},{spaces:2}); console.log('Chain alert sent')}
}
main().catch(e=>{console.error('chain-notify failed:',e);process.exit(1)});

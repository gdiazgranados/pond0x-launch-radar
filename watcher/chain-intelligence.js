const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const DISTRIBUTOR = 'AYg4dKoZJudVkD7Eu3ZaJjkzfoaATUqfiv8w8pS53opT';
const UPSTREAM = 'BbMgFxZGVq5x6WC1yFeVzgtyckMZgj5FjPwdppMtShf';
const REWARD_WALLET = '1orFCnFfgwPzSgUaoK6Wr3MjgXZ7mtk8NGz9Hh4iWWL';
const WPOND_MINT = '3JgFwoYV74f6LwWjQWnr3YDPFnmBdwQfNyubv99jqUoq';
const dataDir = path.join(__dirname, '..', 'public', 'data');
const outputFile = path.join(dataDir, 'chain-intelligence.json');
const historyFile = path.join(dataDir, 'chain-history.json');

function n(v) { const x = Number(v || 0); return Number.isFinite(x) ? x : 0; }
function iso(ts) { return new Date(n(ts) * 1000).toISOString(); }
function within(ts, minutes, nowSec) { return n(ts) >= nowSec - minutes * 60; }
function sum(xs, f) { return xs.reduce((a, x) => a + n(f(x)), 0); }
function uniq(xs) { return [...new Set(xs.filter(Boolean))]; }
function round(v, d=3) { const p=10**d; return Math.round(n(v)*p)/p; }

async function fetchAddressTransactions(address, limit=100) {
  if (!HELIUS_API_KEY) throw new Error('HELIUS_API_KEY is missing');
  const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${encodeURIComponent(HELIUS_API_KEY)}&limit=${limit}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Helius ${address.slice(0,6)} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function extractTransfers(txs) {
  const out = [];
  for (const tx of Array.isArray(txs) ? txs : []) {
    for (const t of Array.isArray(tx.tokenTransfers) ? tx.tokenTransfers : []) {
      if (t.mint !== WPOND_MINT) continue;
      out.push({
        signature: tx.signature,
        timestamp: n(tx.timestamp),
        time: iso(tx.timestamp),
        from: t.fromUserAccount || t.fromTokenAccount || '',
        to: t.toUserAccount || t.toTokenAccount || '',
        amount: n(t.tokenAmount),
        type: tx.type || 'TRANSFER',
        source: tx.source || 'UNKNOWN',
      });
    }
  }
  return out;
}

function stats(claims, minutes, nowSec) {
  const rows = claims.filter(x => within(x.timestamp, minutes, nowSec));
  const total = sum(rows, x => x.amount);
  return {
    minutes,
    rewards: rows.length,
    wpondDistributed: round(total),
    uniqueRecipients: uniq(rows.map(x => x.to)).length,
    avgReward: rows.length ? round(total / rows.length) : 0,
    largestReward: round(Math.max(0, ...rows.map(x => x.amount))),
  };
}

async function main() {
  await fs.ensureDir(dataDir);
  const [distTxs, upstreamTxs, rewardTxs] = await Promise.all([
    fetchAddressTransactions(DISTRIBUTOR, 100),
    fetchAddressTransactions(UPSTREAM, 50),
    fetchAddressTransactions(REWARD_WALLET, 50),
  ]);
  const nowSec = Math.floor(Date.now()/1000);
  const distTransfers = extractTransfers(distTxs);
  const claims = distTransfers
    .filter(x => x.from === DISTRIBUTOR && x.to && x.to !== DISTRIBUTOR)
    .sort((a,b)=>b.timestamp-a.timestamp);
  const funding = extractTransfers(upstreamTxs)
    .filter(x => x.to === DISTRIBUTOR || (x.from === UPSTREAM && x.to === DISTRIBUTOR))
    .sort((a,b)=>b.timestamp-a.timestamp);
  const rewardFlow = extractTransfers(rewardTxs).sort((a,b)=>b.timestamp-a.timestamp);

  const w5 = stats(claims,5,nowSec), w15=stats(claims,15,nowSec), w60=stats(claims,60,nowSec), w24=stats(claims,1440,nowSec);
  const prev5Rows = claims.filter(x => x.timestamp < nowSec-300 && x.timestamp >= nowSec-600);
  const prev5Total = sum(prev5Rows,x=>x.amount);
  const claimVelocityPct = prev5Rows.length ? round(((w5.rewards-prev5Rows.length)/prev5Rows.length)*100,1) : (w5.rewards ? 100 : 0);
  const volumeVelocityPct = prev5Total ? round(((w5.wpondDistributed-prev5Total)/prev5Total)*100,1) : (w5.wpondDistributed ? 100 : 0);
  const lastClaim = claims[0] || null;
  const silenceMinutes = lastClaim ? round((nowSec-lastClaim.timestamp)/60,1) : null;
  const activityState = w5.rewards >= 10 ? 'SURGING' : w5.rewards >= 4 ? 'HIGH' : w5.rewards >= 1 ? 'ACTIVE' : (w15.rewards ? 'COOLING' : 'QUIET');
  const recentFunding = funding.find(x=>within(x.timestamp,15,nowSec)) || null;
  const confirmationScore = Math.min(100, (w5.rewards?45:0) + (recentFunding?25:0) + (w5.uniqueRecipients>=3?15:0) + (rewardFlow.some(x=>within(x.timestamp,15,nowSec))?15:0));

  const output = {
    generatedAt: new Date().toISOString(),
    version: '1.0.0',
    status: 'LIVE',
    confidence: 'VERY HIGH',
    entities: { wpondMint: WPOND_MINT, claimDistributor: DISTRIBUTOR, upstream: UPSTREAM, rewardWallet: REWARD_WALLET },
    activityState,
    chainConfirmationScore: confirmationScore,
    claimVelocityPct,
    volumeVelocityPct,
    silenceMinutes,
    fundingDetected: Boolean(recentFunding),
    lastFunding: recentFunding,
    lastClaim,
    windows: { '5m': w5, '15m': w15, '1h': w60, '24h': w24 },
    recentClaims: claims.slice(0,20),
    recentFundingEvents: funding.slice(0,10),
    methodology: 'Direct wPOND transfers from the high-confidence Pond0x Claim Distributor are classified as reward/claim candidates; DEX/swap flows are kept separate.',
  };
  await fs.writeJson(outputFile, output, {spaces:2});
  let hist=[]; try { hist=await fs.readJson(historyFile); if(!Array.isArray(hist)) hist=[]; } catch {}
  hist.unshift({generatedAt:output.generatedAt, activityState, chainConfirmationScore:confirmationScore, claimVelocityPct, fundingDetected:Boolean(recentFunding), windows:output.windows});
  await fs.writeJson(historyFile, hist.slice(0,2016), {spaces:2}); // ~7d at 5m
  console.log(`Chain Intelligence: ${activityState} | 5m=${w5.rewards} rewards | ${w5.wpondDistributed} wPOND | recipients=${w5.uniqueRecipients}`);
}
main().catch(e=>{ console.error('chain-intelligence failed:',e); process.exit(1); });

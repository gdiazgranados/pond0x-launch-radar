"use strict";

const ENTITY_REGISTRY = [
  {
    address: "AYg4dKoZJudVkD7Eu3ZaJjkzfoaATUqfiv8w8pS53opT",
    role: "CLAIM_DISTRIBUTOR",
    status: "CONFIRMED_OBSERVED",
    evidence: "Direct wPOND outflows are observed by chain-intelligence.",
  },
  {
    address: "1orFCnFfgwPzSgUaoK6Wr3MjgXZ7mtk8NGz9Hh4iWWL",
    role: "REWARD_AGGREGATION_WALLET",
    status: "CONFIRMED_OBSERVED",
    evidence: "Receives repeated wPOND transfers from the monitored distributor.",
  },
  {
    address: "HdM9481g5mXApUUsMSMxwVcRVcTde7nqLjGsgqMMf4P2",
    role: "POOL_OR_RELAY",
    status: "AMBIGUOUS",
    evidence: "Previously observed as the wPOND/SOL Raydium CLMM address; do not treat as a mining payer without instruction-level proof.",
  },
  {
    address: "1orBuM2wX9oSZy2Rxd9VZqcX5f93J5GbSS1T6AoSWWL",
    role: "VANITY_FAMILY_CANDIDATE",
    status: "UNCONFIRMED_RELATION",
    evidence: "Shares the 1or…WWL vanity pattern with the reward wallet and has an observed graph edge; common control is not established.",
  },
];

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 2) {
  const power = 10 ** digits;
  return Math.round(number(value) * power) / power;
}

function percentile(values, fraction) {
  const ordered = values.map(number).filter((value) => value > 0).sort((a, b) => a - b);
  if (!ordered.length) return null;
  const index = (ordered.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return round(ordered[lower]);
  return round(ordered[lower] + (ordered[upper] - ordered[lower]) * (index - lower));
}

function freshness(lastObservedAt, nowMs) {
  const timestamp = Date.parse(lastObservedAt || "");
  if (!Number.isFinite(timestamp)) {
    return { status: "UNKNOWN", ageMinutes: null, hasRecentActivity: false };
  }

  const ageMinutes = Math.max(0, round((nowMs - timestamp) / 60_000, 1));
  const status =
    ageMinutes <= 60 ? "LIVE" :
    ageMinutes <= 360 ? "COOLING" :
    ageMinutes <= 1440 ? "STALE" :
    "INACTIVE";

  return {
    status,
    ageMinutes,
    hasRecentActivity: status === "LIVE" || status === "COOLING",
  };
}

function concentration(recipients) {
  const ranked = recipients
    .filter((row) => row?.wallet)
    .map((row) => ({
      wallet: row.wallet,
      totalWPOND: number(row.totalWPOND),
      transferCount: number(row.transferCount),
    }))
    .sort((a, b) => b.totalWPOND - a.totalWPOND);

  const total = ranked.reduce((sum, row) => sum + row.totalWPOND, 0);
  const share = (rows) => total
    ? round(rows.reduce((sum, row) => sum + row.totalWPOND, 0) / total * 100, 1)
    : 0;
  const hhi = total
    ? round(ranked.reduce((sum, row) => sum + (row.totalWPOND / total) ** 2, 0) * 10_000, 0)
    : 0;

  return {
    top1SharePct: share(ranked.slice(0, 1)),
    top5SharePct: share(ranked.slice(0, 5)),
    hhi,
    concentrationClass: hhi >= 2500 ? "HIGH" : hhi >= 1500 ? "MODERATE" : "DISTRIBUTED",
    topRecipients: ranked.slice(0, 5),
  };
}

function buildMiningIntelligence(chain, ledger, distributor, now = new Date()) {
  const recipients = Array.isArray(ledger?.recipients) ? ledger.recipients : [];
  const recentTransfers = Array.isArray(chain?.recentExternalClaims)
    ? chain.recentExternalClaims
    : [];
  const amounts = recentTransfers.map((row) => number(row?.amount)).filter((value) => value > 0);
  const repeatRecipients = recipients.filter((row) => number(row?.transferCount) >= 2);
  const repeatTransfers = repeatRecipients.reduce((sum, row) => sum + number(row.transferCount), 0);
  const totalTransfers = recipients.reduce((sum, row) => sum + number(row.transferCount), 0);
  const lastObservedAt = distributor?.latestTransfer?.time || ledger?.lastObservedAt || null;

  return {
    version: "1.1.0",
    generatedAt: now.toISOString(),
    classification: "OBSERVED_MINING_ACTIVITY_CANDIDATES",
    scoreNeutral: true,
    freshness: freshness(lastObservedAt, now.getTime()),
    windows: distributor?.windows || {},
    velocity1h: distributor?.velocity1h || null,
    activityState: distributor?.activityState || "UNKNOWN",
    lifetime: {
      candidateRecipients: recipients.length,
      candidateTransfers: totalTransfers,
      wpondObserved: round(ledger?.totalWPOND),
      repeatRecipientPct: recipients.length
        ? round(repeatRecipients.length / recipients.length * 100, 1)
        : 0,
      repeatTransferPct: totalTransfers
        ? round(repeatTransfers / totalTransfers * 100, 1)
        : 0,
    },
    concentration: concentration(recipients),
    amountProfile: {
      sampleSize: amounts.length,
      p25: percentile(amounts, 0.25),
      median: percentile(amounts, 0.5),
      p75: percentile(amounts, 0.75),
      largest: amounts.length ? round(Math.max(...amounts)) : null,
      method: "Observed quantiles; no fixed claim-size band is assumed.",
    },
    entities: ENTITY_REGISTRY.map((entity) => ({
      ...entity,
      observedInCurrentChainModel: Object.values(chain?.entities || {}).includes(entity.address),
    })),
    coverage: {
      complete: distributor?.coverage?.coverageComplete === true,
      sampleLimited: distributor?.coverage?.sampleLimited === true,
      horizonMinutes: number(distributor?.coverage?.horizonMinutes),
      analyzedTransferSample: number(distributor?.coverage?.analyzedTransferSample),
      sourceStatus: distributor?.coverage?.coverageComplete === true ? "HEALTHY" : "LIMITED",
      lifetimeSampleLimited: totalTransfers < 20,
      lifetimeTransferSample: totalTransfers,
      minimumReliableLifetimeSample: 20,
    },
    methodology:
      "Derived only from Pond0x Radar's own observed wPOND transfers and persistent recipient ledger. Direct distributor outflows to external recipients remain claim candidates, not confirmed mining rewards. This module does not affect Radar Score, activation decisions, or alerts.",
  };
}

module.exports = { buildMiningIntelligence, ENTITY_REGISTRY };

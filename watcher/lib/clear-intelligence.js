"use strict";

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(n(value) * factor) / factor;
}

function quoteState(quote) {
  if (!quote || quote.error) return "NOT_TESTED";
  return n(quote.outAmount) > 0 ? "QUOTE_AVAILABLE" : "NO_QUOTE";
}

function buildClearIntelligence(input = {}) {
  const generatedAt = input.generatedAt || new Date().toISOString();
  const paperSupply = n(input.paperSupply);
  const ccpuSupply = n(input.ccpuSupply);
  const ccpuReserveBalance = n(input.ccpuReserveBalance);
  const vaultUsdc = n(input.vaultUsdc);
  const issuanceEvents = Array.isArray(input.issuanceEvents)
    ? input.issuanceEvents
    : [];
  const quotes = input.quotes || {};

  const reservePaperDelta = round(ccpuReserveBalance - paperSupply);
  const supplyGap = round(ccpuSupply - paperSupply);
  const backingRatio = paperSupply > 0 ? round(vaultUsdc / paperSupply, 4) : null;
  const portalPaperState = input.portalPaperState || "UNKNOWN";
  const directPaperRoute = quoteState(quotes.usdcToPaper);
  const reversePaperRoute = quoteState(quotes.paperToUsdc);
  const directCcpuRoute = quoteState(quotes.usdcToCcpu);
  const reverseCcpuRoute = quoteState(quotes.ccpuToUsdc);

  const issuanceObserved =
    issuanceEvents.length > 0 || input.issuanceObserved === true;
  const redemptionObserved = input.redemptionObserved === true;

  return {
    schemaVersion: 1,
    generatedAt,
    status: input.freshness === "RESEARCH_BASELINE" ? "RESEARCH_BASELINE" : "LIVE_OBSERVATION",
    state: issuanceObserved ? "ISSUANCE_OBSERVED" : "NO_RECENT_ISSUANCE",
    scoreNeutral: true,
    freshness: input.freshness || "LIVE",
    tokens: {
      paper: {
        mint: input.paperMint,
        supply: paperSupply,
      },
      ccpu: {
        mint: input.ccpuMint,
        supply: ccpuSupply,
        reserveBalance: ccpuReserveBalance,
      },
    },
    accounting: {
      reservePaperDelta,
      supplyGap,
      vaultUsdc,
      backingRatio,
      backingStatus:
        paperSupply > 0 && vaultUsdc > 0 ? "PARTIAL_OBSERVATION" : "UNPROVEN",
      note:
        "Vault USDC is observable, but a balance alone does not prove a legal or programmatic 1:1 redemption claim.",
    },
    routes: {
      portalPaper: portalPaperState,
      usdcToPaper: directPaperRoute,
      paperToUsdc: reversePaperRoute,
      usdcToCcpu: directCcpuRoute,
      ccpuToUsdc: reverseCcpuRoute,
      quotes,
    },
    activity: {
      issuanceObserved,
      issuanceEvents: issuanceEvents.slice(0, 12),
      redemptionObserved,
    },
    capabilities: [
      { id: "infrastructure", label: "Relevant program and account activity", state: "OBSERVED" },
      { id: "labeled-usd", label: "PAPER issuance", state: issuanceObserved ? "OBSERVED" : "UNPROVEN" },
      { id: "collateral", label: "LRT collateral", state: "UNPROVEN" },
      { id: "borrow", label: "Borrowing / debt", state: "UNPROVEN" },
      { id: "market", label: "Material secondary liquidity", state: reversePaperRoute === "QUOTE_AVAILABLE" ? "OBSERVED" : "UNPROVEN" },
      { id: "farm", label: "Farming and yield", state: "UNPROVEN" },
      { id: "repay", label: "Repayment", state: redemptionObserved ? "OBSERVED" : "UNPROVEN" },
      { id: "redeem", label: "PAPER redemption", state: redemptionObserved ? "VERIFIED" : "UNPROVEN" },
      { id: "governance", label: "Governance rewards", state: "UNPROVEN" },
      { id: "cross-chain", label: "Cross-chain use", state: "UNPROVEN" },
    ],
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
    methodology:
      "Score-neutral observation of token supply, vault balances, executable route quotes and transaction-level PAPER/CCPU activity. Facts, inferences and unproven capabilities remain separate.",
  };
}

module.exports = { buildClearIntelligence, quoteState };

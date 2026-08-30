import { NextResponse } from "next/server"

const RADAR_DATA_BASE = process.env.NEXT_PUBLIC_RADAR_DATA_BASE || "https://raw.githubusercontent.com/gdiazgranados/pond0x-launch-radar/radar-data/data"
function remoteJsonUrl(file: string) { return `${RADAR_DATA_BASE}/${file.replace(/^\/+/, "")}?t=${Date.now()}` }
async function loadRemoteJson(file: string) { try { const res = await fetch(remoteJsonUrl(file), { cache: "no-store" }); if (!res.ok) throw new Error(`${file} failed (${res.status})`); return await res.json() } catch (err) { console.error(`Error loading ${file}:`, err); return null } }
function clampPercent(value: number) { const n = Number(value || 0); return !Number.isFinite(n) ? 0 : Math.max(0, Math.min(100, Math.round(n * 100) / 100)) }
function normalizeScoreToPercent(rawScore: number) { const n = Number(rawScore || 0); return !Number.isFinite(n) || n <= 0 ? 0 : clampPercent(Math.log10(n + 1) * 50) }
function classifyIntensity(rawScore: number) { const n = Number(rawScore || 0); if (n >= 100) return "EXTREME"; if (n >= 70) return "VERY HIGH"; if (n >= 40) return "HIGH"; if (n >= 15) return "MEDIUM"; return "LOW" }
function normalizeRadarItem(item: any) { const rawScore = Number(item?.rawScore ?? item?.score ?? 0); return { ...item, rawScore, scorePercent: normalizeScoreToPercent(rawScore), movementPercent: clampPercent(Number(item?.movementPct ?? 0)), addedPercent: clampPercent(Number(item?.addedPct ?? 0)), changedPercent: clampPercent(Number(item?.changedPct ?? 0)), activationProbability: clampPercent(Number(item?.activationProbability ?? 0)), intensityClass: classifyIntensity(rawScore), overdrive: rawScore > 100 } }

export async function GET() {
  try {
    const files = ["latest.json","history.json","heartbeat.json","sentinel-state.json","sentinel-events.json","chain-intelligence.json","chain-baseline.json","reward-recipients.json","system-health.json","telegram-health.json","distributor-intelligence.json","route-api-intelligence.json","activation-timeline.json","activation-decision.json","historical-replay.json","calibration-report.json","ground-truth-events.json","historical-evidence-archive.json","threshold-drift-report.json","pre-event-signature-intelligence.json","evidence-ledger.json","alerts-history.json"]
    const [latest,history,heartbeat,sentinelState,sentinelEvents,chainIntelligence,chainBaseline,rewardRecipients,systemHealth,telegramHealth,distributorIntelligence,routeApiIntelligence,activationTimeline,activationDecision,historicalReplay,calibrationReport,groundTruthEvents,historicalEvidenceArchive,thresholdDriftReport,preEventSignatureIntelligence,evidenceLedger,alertsHistory] = await Promise.all(files.map(loadRemoteJson))
    const intelligence = { routeApiIntelligence: routeApiIntelligence || null, activationTimeline: activationTimeline || null, activationDecision: activationDecision || null, historicalReplay: historicalReplay || null, calibrationReport: calibrationReport || null, groundTruthEvents: groundTruthEvents || null, historicalEvidenceArchive: historicalEvidenceArchive || null, thresholdDriftReport: thresholdDriftReport || null, preEventSignatureIntelligence: preEventSignatureIntelligence || null }
    const normalizedLatest = latest ? { ...normalizeRadarItem(latest), ...intelligence } : Object.values(intelligence).some(Boolean) ? intelligence : null
    const normalizedHistory = Array.isArray(history) ? history.filter(Boolean).map(normalizeRadarItem) : []
    const mergedChainIntelligence = chainIntelligence ? { ...chainIntelligence, recipientLedger: rewardRecipients || chainIntelligence?.recipientLedger || null, distributorIntelligence: distributorIntelligence || null } : rewardRecipients || distributorIntelligence ? { recipientLedger: rewardRecipients || null, distributorIntelligence: distributorIntelligence || null } : null
    return NextResponse.json({ evidenceLedger, alerts: Array.isArray(alertsHistory) ? alertsHistory.filter(item => item?.sentAt) : [], latest: normalizedLatest, history: normalizedHistory, heartbeat, sentinelState, sentinelEvents, chainIntelligence: mergedChainIntelligence, chainBaseline, rewardRecipients, systemHealth, telegramHealth, distributorIntelligence, routeApiIntelligence, activationTimeline, activationDecision, historicalReplay, calibrationReport, groundTruthEvents, historicalEvidenceArchive, thresholdDriftReport, preEventSignatureIntelligence, source: "remote-radar-data", fetchedAt: new Date().toISOString() })
  } catch (err) {
    console.error("Radar API error:", err)
    return NextResponse.json({ error: "Radar API failed", details: err instanceof Error ? err.message : "unknown" }, { status: 500 })
  }
}

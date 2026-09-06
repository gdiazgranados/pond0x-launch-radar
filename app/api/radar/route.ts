import { NextResponse } from "next/server"
import clearResearchBaseline from "../../../public/data/clear-intelligence.json"

const RADAR_DATA_BASE = process.env.NEXT_PUBLIC_RADAR_DATA_BASE || "https://raw.githubusercontent.com/gdiazgranados/pond0x-launch-radar/radar-data/data"
function remoteJsonUrl(file: string) { return `${RADAR_DATA_BASE}/${file.replace(/^\/+/, "")}` }
async function loadRemoteJson(file: string) { try { const res = await fetch(remoteJsonUrl(file), { next: { revalidate: 60 } }); if (!res.ok) throw new Error(`${file} failed (${res.status})`); return await res.json() } catch (err) { console.error(`Error loading ${file}:`, err); return null } }
function clampPercent(value: number) { const n = Number(value || 0); return !Number.isFinite(n) ? 0 : Math.max(0, Math.min(100, Math.round(n * 100) / 100)) }
function normalizeScoreToPercent(rawScore: number) { const n = Number(rawScore || 0); return !Number.isFinite(n) || n <= 0 ? 0 : clampPercent(Math.log10(n + 1) * 50) }
function classifyIntensity(rawScore: number) { const n = Number(rawScore || 0); if (n >= 100) return "EXTREME"; if (n >= 70) return "VERY HIGH"; if (n >= 40) return "HIGH"; if (n >= 15) return "MEDIUM"; return "LOW" }
function normalizeRadarItem(item: any) { const rawScore = Number(item?.rawScore ?? item?.score ?? 0); return { ...item, rawScore, scorePercent: normalizeScoreToPercent(rawScore), movementPercent: clampPercent(Number(item?.movementPct ?? 0)), addedPercent: clampPercent(Number(item?.addedPct ?? 0)), changedPercent: clampPercent(Number(item?.changedPct ?? 0)), activationProbability: clampPercent(Number(item?.activationProbability ?? 0)), intensityClass: classifyIntensity(rawScore), overdrive: rawScore > 100 } }
function recipientPriority(recipient: any) { return recipient?.frequencyClass === "FREQUENT" ? 3 : recipient?.frequencyClass === "REPEAT" ? 2 : 1 }
function compactRecipientLedger(ledger: any) { if (!ledger || !Array.isArray(ledger.recipients)) return ledger || null; const recipients = [...ledger.recipients].sort((left, right) => recipientPriority(right) - recipientPriority(left) || Number(right?.transferCount || 0) - Number(left?.transferCount || 0) || Number(right?.totalWPOND || 0) - Number(left?.totalWPOND || 0) || Date.parse(right?.lastSeenAt || "") - Date.parse(left?.lastSeenAt || "") || String(left?.wallet || "").localeCompare(String(right?.wallet || ""))).slice(0, 10); return { ...ledger, recipients, returnedRecipients: recipients.length, recipientListTruncated: ledger.recipients.length > recipients.length } }

export async function GET() {
  try {
    const files = ["latest.json","history.json","heartbeat.json","sentinel-state.json","sentinel-events.json","chain-intelligence.json","chain-baseline.json","reward-recipients.json","system-health.json","telegram-health.json","distributor-intelligence.json","mining-intelligence.json","evidence-ledger.json","alerts-history.json","clear-intelligence.json"]
    const [latest,history,heartbeat,sentinelState,sentinelEvents,chainIntelligence,chainBaseline,rewardRecipients,systemHealth,telegramHealth,distributorIntelligence,miningIntelligence,evidenceLedger,alertsHistory,clearIntelligence] = await Promise.all(files.map(loadRemoteJson))
    const normalizedLatest = latest ? normalizeRadarItem(latest) : null
    const normalizedHistory = Array.isArray(history) ? history.filter(Boolean).map(normalizeRadarItem) : []
    const compactRecipients = compactRecipientLedger(rewardRecipients || chainIntelligence?.recipientLedger)
    const mergedChainIntelligence = chainIntelligence ? { ...chainIntelligence, recipientLedger: compactRecipients, distributorIntelligence: distributorIntelligence || null } : compactRecipients || distributorIntelligence ? { recipientLedger: compactRecipients, distributorIntelligence: distributorIntelligence || null } : null
    return NextResponse.json({ evidenceLedger, alerts: Array.isArray(alertsHistory) ? alertsHistory.filter(item => item?.sentAt) : [], latest: normalizedLatest, history: normalizedHistory, heartbeat, sentinelState, sentinelEvents, chainIntelligence: mergedChainIntelligence, chainBaseline, systemHealth, telegramHealth, miningIntelligence, clearIntelligence: clearIntelligence || clearResearchBaseline, source: "remote-radar-data", fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" } })
  } catch (err) {
    console.error("Radar API error:", err)
    return NextResponse.json({ error: "Radar API failed", details: err instanceof Error ? err.message : "unknown" }, { status: 500 })
  }
}

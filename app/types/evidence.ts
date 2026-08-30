export type EvidenceEvent = {
  id: string
  kind: string
  observedAt: string
  interval: { startAt: string; endAt: string }
  context: { chainStatus: string; webStatus: string; claimsAvailable: string; coObserved?: boolean; correlation?: string }
  evidence: {
    transfers?: { id: string; kind: string; signature: string; from: string; to: string; mint: string; amount: number; occurredAt: string; explorerUrl: string }[]
    changes?: { kind: string; target: string; before: string | number | boolean; after: string | number | boolean }[]
    issues?: string[]
  }
  decision: { eligible: boolean; reason: string; ruleVersion: string }
  delivery: { status: string; sentAt: string | null }
  detailPath: string
  message: string
}
export type EvidenceLedger = {
  version: number
  mode: string
  generatedAt: string
  context: EvidenceEvent["context"]
  issues: string[]
  events: EvidenceEvent[]
}

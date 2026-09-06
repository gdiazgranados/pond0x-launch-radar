import { IndicatorHelp } from "./IndicatorHelp"
function fmt(v: any, digits = 1) {
  const n = Number(v)
  return Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: digits })
    : "—"
}

function when(v?: string | null) {
  if (!v) return "—"
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString()
}

const RECIPIENT_DISPLAY_LIMIT = 10

function recipientPriority(recipient: any) {
  if (recipient?.frequencyClass === "FREQUENT") return 3
  if (recipient?.frequencyClass === "REPEAT") return 2
  return 1
}

function matchTone(v: number) {
  if (v >= 80) return "text-emerald-300"
  if (v >= 65) return "text-yellow-300"
  if (v >= 45) return "text-orange-300"
  return "text-slate-300"
}

function distributorTone(state?: string) {
  switch (String(state || "QUIET")) {
    case "SURGING":
      return "border-red-500/30 bg-red-500/10 text-red-300"
    case "BURSTING":
      return "border-orange-500/30 bg-orange-500/10 text-orange-300"
    case "ACTIVE":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-300"
    case "COOLING":
      return "border-cyan-500/20 bg-cyan-500/10 text-cyan-300"
    default:
      return "border-white/10 bg-white/5 text-slate-300"
  }
}

function getWindowState(p: any) {
  const expectedAt = p?.nextFundingExpectedAt
  const halfWidthSeconds = Number(p?.fundingWindowHalfWidthSeconds || 0)

  if (!expectedAt) {
    return {
      label: "NO WINDOW",
      tone: "text-slate-300",
      badge: "border-white/10 bg-white/5 text-slate-300",
      note: "waiting for enough cadence data",
    }
  }

  const target = new Date(expectedAt).getTime()
  if (!Number.isFinite(target)) {
    return {
      label: "NO WINDOW",
      tone: "text-slate-300",
      badge: "border-white/10 bg-white/5 text-slate-300",
      note: "invalid predicted window",
    }
  }

  const now = Date.now()
  const halfWidthMs = Math.max(0, halfWidthSeconds) * 1000
  const start = target - halfWidthMs
  const end = target + halfWidthMs

  if (now >= start && now <= end) {
    return {
      label: "WINDOW ACTIVE",
      tone: "text-red-300",
      badge: "border-red-500/30 bg-red-500/10 text-red-200",
      note: `inside ±${fmt(halfWidthSeconds, 0)}s funding window`,
    }
  }

  if (now < start) {
    const seconds = Math.max(0, Math.round((start - now) / 1000))
    return {
      label: "UPCOMING",
      tone: "text-orange-300",
      badge: "border-orange-500/30 bg-orange-500/10 text-orange-200",
      note: `window opens in ~${fmt(seconds, 0)}s`,
    }
  }

  return {
    label: "WINDOW PASSED",
    tone: "text-slate-300",
    badge: "border-white/10 bg-white/5 text-slate-300",
    note: "predicted funding window has elapsed",
  }
}

export function ChainIntelligencePanel({
  chain,
  baseline,
}: {
  chain?: any
  baseline?: any
}) {
  if (!chain) return null

  const a = chain.cycleAnalytics || {}
  const p = chain.predictor || {}
  const m = chain.patternMatch || {}
  const w = chain.windows?.["5m"] || {}
  const d = chain.distributorIntelligence || {}

  const recipientLedger = chain.recipientLedger || {}
  const recipients = Array.isArray(recipientLedger.recipients)
    ? recipientLedger.recipients
    : []

  const priorityRecipients = [...recipients]
    .sort((left: any, right: any) => {
      const statusDifference = recipientPriority(right) - recipientPriority(left)
      if (statusDifference) return statusDifference

      const transferDifference =
        Number(right?.transferCount || 0) - Number(left?.transferCount || 0)
      if (transferDifference) return transferDifference

      const amountDifference =
        Number(right?.totalWPOND || 0) - Number(left?.totalWPOND || 0)
      if (amountDifference) return amountDifference

      const recentDifference =
        Date.parse(right?.lastSeenAt || "") - Date.parse(left?.lastSeenAt || "")
      if (Number.isFinite(recentDifference) && recentDifference) return recentDifference

      return String(left?.wallet || "").localeCompare(String(right?.wallet || ""))
    })
    .slice(0, RECIPIENT_DISPLAY_LIMIT)

  const observedRecipientCount = Number(
    recipientLedger.totalRecipients ?? recipients.length
  )
  const hiddenRecipientCount = Math.max(
    0,
    observedRecipientCount - priorityRecipients.length
  )

  const match = Number(m.historicalPatternMatchPct || 0)

  const freshTrigger =
    chain.fundingDetected === true ||
    Number(w.rewardTransfers ?? w.rewards ?? 0) > 0

  const windowState = getWindowState(p)
  const distributorOneHour = d.windows?.["1h"] || {}
  const distributorSixHours = d.windows?.["6h"] || {}
  const distributorTwentyFourHours = d.windows?.["24h"] || {}
  const recipientMix = d.recipientMix || {}
  const transferProfile = d.transferProfile || {}
  const burstInfo = d.bursts || {}
  const velocity = d.velocity1h || {}

  return (
    <section className="mb-5 rounded-3xl border border-cyan-500/20 bg-cyan-950/10 p-4 shadow-[0_0_30px_rgba(34,211,238,0.06)] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-400">
            On-chain Intelligence
          </div>

          <h2 className="mt-1 text-xl font-semibold sm:text-2xl">
            wPOND Distribution Cycle Predictor <IndicatorHelp label="wPOND Distribution Cycle Predictor" />
          </h2>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-cyan-200">
            ON-CHAIN: {chain.activityState || "UNKNOWN"}
          </span>

          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
            v{chain.version || "—"}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs uppercase tracking-wider text-slate-500">
            Pattern Match
          </div>
          <div className={`mt-1 text-2xl font-semibold ${matchTone(match)}`}>
            {fmt(m.historicalPatternMatchPct)}%
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {String(m.status || "NO_BASELINE").replaceAll("_", " ")} ·{" "}
            {m.confidence || "LOW"} confidence
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs uppercase tracking-wider text-slate-500">
            Funding Cadence
          </div>
          <div className="mt-1 text-2xl font-semibold text-cyan-300">
            {p.status === "SESSION_INACTIVE"
              ? `${a.cadenceConfidence || "LOW"} HISTORICAL`
              : a.cadenceConfidence || "LOW"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            median {fmt(a.medianFundingCadenceSeconds)}s
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs uppercase tracking-wider text-slate-500">
            Claim After Funding
          </div>
          <div className="mt-1 text-2xl font-semibold text-yellow-300">
            {fmt(a.claimAfterFundingProbabilityPct)}%
          </div>
          <div className="mt-1 text-xs text-slate-500">
            observed historical correlation
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs uppercase tracking-wider text-slate-500">
            Operational Automation Confidence
          </div>
          <div className="mt-1 text-2xl font-semibold text-emerald-300">
            {fmt(a.automationConfidence, 0)}/100
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {p.status === "SESSION_INACTIVE"
              ? `Session inactive · structural confidence ${fmt(
                  a.liveAutomationConfidence,
                  0
                )}/100`
              : String(a.cycleSignal || "NO_STABLE_CYCLE").replaceAll("_", " ")}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs uppercase tracking-wider text-slate-500">
            Predictor
          </div>
          <div className="mt-1 text-2xl font-semibold text-orange-300">
            {String(p.status || "—").replaceAll("_", " ")}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            ±{fmt(p.fundingWindowHalfWidthSeconds, 0)}s window
          </div>
        </div>

        <div
          className={`rounded-2xl border p-4 ${
            freshTrigger
              ? "border-red-500/30 bg-red-500/[0.08]"
              : "border-white/10 bg-black/20"
          }`}
        >
          <div className="text-xs uppercase tracking-wider text-slate-500">
            Fresh Trigger
          </div>
          <div
            className={`mt-1 text-2xl font-semibold ${
              freshTrigger ? "text-red-300" : "text-slate-300"
            }`}
          >
            {freshTrigger ? "DETECTED" : "NONE"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {freshTrigger
              ? "transfers observed in the sampled rolling window; not a claim confirmation"
              : "no fresh on-chain evidence"}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div
          className={`rounded-2xl border p-4 ${
            windowState.label === "WINDOW ACTIVE"
              ? "border-red-500/30 bg-red-500/[0.08] shadow-[0_0_20px_rgba(239,68,68,0.08)]"
              : windowState.label === "UPCOMING"
                ? "border-orange-500/20 bg-orange-500/[0.05]"
                : "border-white/10 bg-black/20"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="text-xs text-slate-500">
              Statistical funding window
            </div>

            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${windowState.badge}`}
            >
              {windowState.label}
            </span>
          </div>

          <div className="mt-2 font-mono text-sm text-white">
            {when(p.nextFundingExpectedAt)}
          </div>

          <div className={`mt-2 text-xs ${windowState.tone}`}>
            {windowState.note}
          </div>

          <div className="mt-2 text-xs text-slate-500">
            Claim window after funding:{" "}
            {p.expectedClaimWindowSeconds
              ? `${p.expectedClaimWindowSeconds.start}s → ${p.expectedClaimWindowSeconds.end}s`
              : "—"}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs text-slate-500">Pattern Components <IndicatorHelp label="Pattern Components" /></div>
          <div className="mt-1 text-sm text-white">
            Cadence similarity {fmt(m.components?.cadenceSimilarityPct)}%
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Delay similarity {fmt(
              m.components?.rewardTransferDelaySimilarityPct ??
              m.components?.claimDelaySimilarityPct
            )}% · proximity {fmt(m.components?.predictorProximityPct)}%
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs text-slate-500">Last 5 Minutes <IndicatorHelp label="Last 5 Minutes" /></div>
          <div className="mt-1 text-lg">
            {fmt(w.rewardTransfers ?? w.rewards, 0)} reward transfers · {fmt(w.wpondDistributed)} wPOND
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Chain score {fmt(chain.chainConfirmationScore, 0)}/100
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs text-slate-500">Historical Baseline <IndicatorHelp label="Historical Baseline" /></div>
          <div className="mt-1 text-lg">
            {baseline ? `${fmt(baseline.cyclesAnalyzed, 0)} cycles` : "Not built yet"}
          </div>

          <div className="mt-2 text-xs text-slate-500">
            {baseline
              ? `${fmt(baseline.correlatedCycles, 0)} correlated · ${fmt(
                  baseline.correlationRatePct
                )}%`
              : "Run the historical backfill workflow once."}
          </div>
        </div>
      </div>

      <div
        className={`mt-3 rounded-2xl border p-4 text-xs leading-5 ${
          freshTrigger
            ? "border-red-500/20 bg-red-500/[0.05] text-slate-300"
            : "border-white/10 bg-black/20 text-slate-400"
        }`}
      >
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <span className="font-semibold text-slate-200">Interpretation:</span>{" "}
            {m.interpretation || "Waiting for enough historical data."}
          </div>

          <div className="shrink-0">
            <span
              className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${
                freshTrigger
                  ? "border-red-500/30 bg-red-500/10 text-red-200"
                  : "border-white/10 bg-white/5 text-slate-400"
              }`}
            >
              FRESH TRIGGER: {freshTrigger ? "DETECTED" : "NONE"}
            </span>
          </div>
        </div>
      </div>

      {d.version && (
        <div className="mt-3 rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/[0.04] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-fuchsia-300">
                Reward Distributor Intelligence
              </div>
              <div className="mt-1 font-mono text-[11px] text-slate-500">
                {d.distributor || "unknown distributor"}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-[10px]">
              <span className={`rounded-full border px-3 py-1 font-semibold ${distributorTone(d.activityState)}`}>
                {d.activityState || "QUIET"}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
                v{d.version}
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">1h Flow <IndicatorHelp label="1h Flow" /></div>
              <div className="mt-1 text-lg font-semibold text-white">
                {fmt(distributorOneHour.wpondDistributed)}
              </div>
              <div className="text-[11px] text-slate-500">
                {fmt(distributorOneHour.transfers, 0)} transfers · {fmt(distributorOneHour.uniqueRecipients, 0)} wallets
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">6h Flow <IndicatorHelp label="6h Flow" /></div>
              <div className="mt-1 text-lg font-semibold text-white">
                {fmt(distributorSixHours.wpondDistributed)}
              </div>
              <div className="text-[11px] text-slate-500">
                {fmt(distributorSixHours.transfers, 0)} transfers
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">24h Flow <IndicatorHelp label="24h Flow" /></div>
              <div className="mt-1 text-lg font-semibold text-cyan-300">
                {fmt(distributorTwentyFourHours.wpondDistributed)}
              </div>
              <div className="text-[11px] text-slate-500">
                {fmt(distributorTwentyFourHours.transfers, 0)} transfers
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">1h Velocity <IndicatorHelp label="1h Velocity" /></div>
              <div className={`mt-1 text-lg font-semibold ${Number(velocity.volumeVelocityPct || 0) > 0 ? "text-emerald-300" : Number(velocity.volumeVelocityPct || 0) < 0 ? "text-red-300" : "text-slate-300"}`}>
                {Number(velocity.volumeVelocityPct || 0) > 0 ? "+" : ""}{fmt(velocity.volumeVelocityPct)}%
              </div>
              <div className="text-[11px] text-slate-500">
                transfer velocity {Number(velocity.transferVelocityPct || 0) > 0 ? "+" : ""}{fmt(velocity.transferVelocityPct)}%
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Recipient Mix <IndicatorHelp label="Recipient Mix" /></div>
              <div className="mt-1 text-lg font-semibold text-white">
                {fmt(recipientMix.totalRecipients, 0)}
              </div>
              <div className="text-[11px] text-slate-500">
                {fmt(recipientMix.newRecipients, 0)} new · {fmt(recipientMix.repeatRecipients, 0)} repeat · {fmt(recipientMix.frequentRecipients, 0)} frequent
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Bursts <IndicatorHelp label="Bursts" /></div>
              <div className={`mt-1 text-lg font-semibold ${Number(burstInfo.count || 0) > 0 ? "text-orange-300" : "text-slate-300"}`}>
                {fmt(burstInfo.count, 0)}
              </div>
              <div className="text-[11px] text-slate-500">
                latest {burstInfo.latest ? `${fmt(burstInfo.latest.transfers, 0)} tx / ${fmt(burstInfo.latest.totalWPOND)} wPOND` : "none"}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Median Transfer <IndicatorHelp label="Median Transfer" /></div>
              <div className="mt-1 text-lg font-semibold text-white">
                {fmt(transferProfile.medianTransfer)}
              </div>
              <div className="text-[11px] text-slate-500">
                largest {fmt(transferProfile.largestTransfer)}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Anomalies <IndicatorHelp label="Anomalies" /></div>
              <div className={`mt-1 text-lg font-semibold ${Number(transferProfile.amountAnomalyCount || 0) > 0 ? "text-red-300" : "text-emerald-300"}`}>
                {fmt(transferProfile.amountAnomalyCount, 0)}
              </div>
              <div className="text-[11px] text-slate-500">
                amount ≥ 3× median
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-3 text-[11px] text-slate-400 lg:flex-row lg:items-center lg:justify-between">
            <div>
              Last observed transfer: {d.latestTransfer?.time ? when(d.latestTransfer.time) : "—"}
              {d.lastTransferAgeMinutes !== null && d.lastTransferAgeMinutes !== undefined
                ? ` · ${fmt(d.lastTransferAgeMinutes)} min ago`
                : ""}
            </div>
            <div className={d.coverage?.sampleLimited ? "text-amber-300" : "text-emerald-300"}>
              {d.coverage?.sampleLimited
                ? `Recent sample limited to ${fmt(d.coverage?.analyzedTransferSample, 0)} of ${fmt(d.coverage?.fetchedExternalClaims, 0)} fetched external transfers`
                : d.coverage?.coverageComplete
                  ? "24h distributor coverage complete"
                  : "Distributor coverage incomplete"}
            </div>
          </div>

          <div className="mt-3 text-[11px] leading-5 text-slate-500">
            Observational behavior only. External distributor transfers remain classified as claim candidates and are not automatically asserted to be rewards or claims.
          </div>
        </div>
      )}

      <div className="mt-3 rounded-2xl border border-cyan-500/20 bg-black/20 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
              Prioritized Observed Recipients
            </div>

            <div className="mt-1 text-xs text-slate-500">
              Highest-priority external claim candidates by recurrence, transfer count, volume, and recency
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-[10px]">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
              {fmt(recipientLedger.totalRecipients, 0)} recipients
            </span>

            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
              {fmt(recipientLedger.totalTransfers, 0)} transfers
            </span>

            <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-cyan-200">
              {fmt(recipientLedger.totalWPOND)} wPOND
            </span>
          </div>
        </div>

        {recipients.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <div className="mb-3 text-[11px] text-slate-500">
              Showing {fmt(priorityRecipients.length, 0)} of {fmt(observedRecipientCount, 0)} prioritized recipients
              {hiddenRecipientCount > 0
                ? ` · ${fmt(hiddenRecipientCount, 0)} additional wallets remain available in the underlying ledger`
                : ""}
            </div>

            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="border-b border-white/10 text-slate-500">
                <tr>
                  <th className="pb-2 pr-4 font-medium">Wallet</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">wPOND</th>
                  <th className="pb-2 pr-4 font-medium">Transfers</th>
                  <th className="pb-2 pr-4 font-medium">First Seen</th>
                  <th className="pb-2 pr-4 font-medium">Last Seen</th>
                  <th className="pb-2 font-medium">Last Tx</th>
                </tr>
              </thead>

              <tbody>
                {priorityRecipients.map((recipient: any) => (
                  <tr
                    key={recipient.wallet}
                    className="border-b border-white/5 text-slate-300 last:border-0"
                  >
                    <td className="py-3 pr-4 font-mono">
                      {recipient.wallet ? (
                        <a
                          href={`https://solscan.io/account/${recipient.wallet}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-300 transition hover:text-cyan-200 hover:underline"
                          title={recipient.wallet}
                        >
                          {`${recipient.wallet.slice(0, 6)}...${recipient.wallet.slice(-6)}`}
                        </a>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    <td className="py-3 pr-4">
                      <span
                        className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
                          recipient.frequencyClass === "FREQUENT"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            : recipient.frequencyClass === "REPEAT"
                              ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-300"
                              : "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                        }`}
                      >
                        {recipient.frequencyClass || "NEW"}
                      </span>
                    </td>

                    <td className="py-3 pr-4">
                      {fmt(recipient.totalWPOND)}
                    </td>

                    <td className="py-3 pr-4">
                      {fmt(recipient.transferCount, 0)}
                    </td>

                    <td className="py-3 pr-4 text-slate-400">
                      {when(recipient.firstSeenAt)}
                    </td>

                    <td className="py-3 pr-4 text-slate-400">
                      {when(recipient.lastSeenAt)}
                    </td>

                    <td className="py-3">
                      {recipient.lastSignature ? (
                        <a
                          href={`https://solscan.io/tx/${recipient.lastSignature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-300 transition hover:text-cyan-200 hover:underline"
                          title={recipient.lastSignature}
                        >
                          View ↗
                        </a>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-slate-400">
            No external claim recipients observed yet.
            <div className="mt-1 text-xs text-slate-500">
              The historical ledger remains persistent during quiet periods and
              will populate when qualifying distributor transfers are observed.
            </div>
          </div>
        )}

        <div className="mt-3 text-[11px] leading-5 text-slate-500">
          Classification: EXTERNAL CLAIM CANDIDATES. Observed transfers are not
          automatically asserted to be rewards.
        </div>
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-500">
        Pattern Match measures similarity to observed historical cycles; it is
        not a probability of a claim or launch. Funding timing does not prove a
        claim or launch is imminent, and distribution amounts are not assumed
        to be funded 1:1 by the preceding swap.
      </p>
    </section>
  )
}

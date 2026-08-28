import type { RadarData } from "../../types/radar"
import { SectionTitle } from "./SectionTitle"

function getClassificationStyle(classification?: string) {
  switch (classification) {
    case "FEATURE_ACTIVATION_CANDIDATE":
      return { badge: "border-red-500/30 bg-red-500/10 text-red-300", text: "text-red-300", dot: "bg-red-400" }
    case "FEATURE_ACTIVATION_CONVERGENCE":
      return { badge: "border-amber-500/30 bg-amber-500/10 text-amber-300", text: "text-amber-300", dot: "bg-amber-400" }
    case "FEATURE_SURFACE_TRANSITION":
    case "BUNDLE_SURFACE_DRIFT":
      return { badge: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300", text: "text-cyan-300", dot: "bg-cyan-400" }
    case "DORMANT_FEATURE_SURFACE":
      return { badge: "border-slate-500/30 bg-slate-500/10 text-slate-300", text: "text-slate-300", dot: "bg-slate-400" }
    default:
      return { badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", text: "text-emerald-300", dot: "bg-emerald-400" }
  }
}

function semanticTone(level?: string) {
  switch (level) {
    case "CRITICAL": return "text-red-300 border-red-500/30 bg-red-500/10"
    case "HIGH": return "text-orange-300 border-orange-500/30 bg-orange-500/10"
    case "MEDIUM": return "text-yellow-300 border-yellow-500/30 bg-yellow-500/10"
    case "LOW": return "text-cyan-300 border-cyan-500/30 bg-cyan-500/10"
    default: return "text-slate-300 border-white/10 bg-white/5"
  }
}

function timelineTone(classification?: string) {
  switch (classification) {
    case "COORDINATED_ACTIVATION_CANDIDATE": return "border-red-500/30 bg-red-500/10 text-red-300"
    case "ACTIVATION_SEQUENCE": return "border-orange-500/30 bg-orange-500/10 text-orange-300"
    case "SURFACE_TRANSITION": return "border-amber-500/30 bg-amber-500/10 text-amber-300"
    case "MULTI_DOMAIN_ACTIVITY": return "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
    default: return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
  }
}

function shortHash(value?: string | null) {
  if (!value) return "—"
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-8)}` : value
}

function shortEventType(value?: string) {
  return String(value || "UNKNOWN").replaceAll("_", " ")
}

export function FeatureActivationPanel({ data }: { data?: RadarData | null }) {
  const evidence = data?.featureActivationEvidence
  const intelligence = evidence as any
  const bundleDiff = intelligence?.bundleDiff || null
  const semanticChange = intelligence?.semanticChange || null
  const routeApi = (data as any)?.routeApiIntelligence || null
  const activationTimeline = (data as any)?.activationTimeline || null

  const classification = evidence?.classification || "UNKNOWN"
  const style = getClassificationStyle(classification)

  const dormantRoutes = evidence?.observedDormantRoutes || []
  const activatedRoutes = evidence?.activatedRoutes || []
  const unlockedFlags = evidence?.unlockedFlags || []

  const addedBundles = Array.isArray(bundleDiff?.addedBundles) ? bundleDiff.addedBundles : []
  const removedBundles = Array.isArray(bundleDiff?.removedBundles) ? bundleDiff.removedBundles : []
  const changedBundles = Array.isArray(bundleDiff?.changedBundles) ? bundleDiff.changedBundles : []
  const addedApiRoutes = Array.isArray(bundleDiff?.addedApiRoutes) ? bundleDiff.addedApiRoutes : []
  const removedApiRoutes = Array.isArray(bundleDiff?.removedApiRoutes) ? bundleDiff.removedApiRoutes : []
  const addedRoutes = Array.isArray(bundleDiff?.addedRoutes) ? bundleDiff.addedRoutes : []
  const addedKeywords = Array.isArray(bundleDiff?.addedKeywords) ? bundleDiff.addedKeywords : []
  const addedFlags = Array.isArray(bundleDiff?.addedFlags) ? bundleDiff.addedFlags : []
  const semanticEvidence = Array.isArray(semanticChange?.highValueEvidence) ? semanticChange.highValueEvidence : []
  const semanticReasons = Array.isArray(semanticChange?.reasons) ? semanticChange.reasons : []
  const freshSurface = Array.isArray(routeApi?.freshDiscoveries) ? routeApi.freshDiscoveries : []
  const dormantToLive = Array.isArray(routeApi?.dormantToLive) ? routeApi.dormantToLive : []
  const liveToDormant = Array.isArray(routeApi?.liveToDormant) ? routeApi.liveToDormant : []
  const liveApi = Array.isArray(routeApi?.liveApiRoutes) ? routeApi.liveApiRoutes : []
  const recentTimelineEvents = Array.isArray(activationTimeline?.recent?.events) ? activationTimeline.recent.events : []
  const newTimelineEvents = Array.isArray(activationTimeline?.newEvents) ? activationTimeline.newEvents : []

  const hasBundleEvidence = bundleDiff?.comparable === true || Number(intelligence?.bundleCount || 0) > 0

  return (
    <div className="rounded-3xl border border-white/10 bg-[#05070a] p-4 sm:p-5 xl:col-span-12">
      <SectionTitle
        title="Feature Activation Intelligence"
        subtitle="Production feature-state, bundle-diff, semantic-change, automatic route/API monitoring, and activation timeline"
        right={<span className={`rounded-full border px-3 py-1 text-xs font-medium ${style.badge}`}>{classification}</span>}
      />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Current State</div>
          <div className="mt-3 flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full ${style.dot}`} />
            <div className={`text-xl font-semibold ${style.text}`}>{classification}</div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Build / Bundle Fingerprint</div>
              <div className="mt-2 break-all font-mono text-sm text-slate-200">{evidence?.currentBuildId || "UNKNOWN"}</div>
              <div className="mt-1 text-xs text-slate-500">
                {evidence?.buildChanged ? "Fingerprint changed" : "Fingerprint stable"}
                {intelligence?.buildIdSource ? ` · ${String(intelligence.buildIdSource).replaceAll("_", " ")}` : ""}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Previous Build</div>
              <div className="mt-2 break-all font-mono text-sm text-slate-200">{evidence?.previousBuildId || "UNKNOWN"}</div>
              <div className="mt-1 text-xs text-slate-500">Comparable {evidence?.comparable ? "YES" : "NO"} · {Number(intelligence?.bundleCount || 0)} bundles</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Unlocks</div><div className="mt-2 text-3xl font-semibold text-white">{unlockedFlags.length}</div></div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Activated Routes</div><div className="mt-2 text-3xl font-semibold text-white">{activatedRoutes.length}</div></div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Convergence</div><div className={`mt-2 text-xl font-semibold ${evidence?.convergence ? "text-amber-300" : "text-slate-300"}`}>{evidence?.convergence ? "YES" : "NO"}</div></div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Activation Cluster</div><div className={`mt-2 text-xl font-semibold ${evidence?.activationCluster ? "text-red-300" : "text-slate-300"}`}>{evidence?.activationCluster ? "YES" : "NO"}</div></div>
        </div>
      </div>

      {activationTimeline && (
        <div className="mt-4 rounded-2xl border border-orange-500/20 bg-orange-500/[0.03] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-300">Activation Timeline v2</div>
              <div className="mt-1 text-xs text-slate-500">Persistent feature-flag history plus dormant → live, semantic, on-chain, distributor, and recipient events in one ordered timeline.</div>
            </div>
            <span className={`w-fit rounded-full border px-3 py-1 text-[10px] font-semibold ${timelineTone(activationTimeline.classification)}`}>
              {String(activationTimeline.classification || "QUIET").replaceAll("_", " ")} · {Number(activationTimeline.score || 0)}/100
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Flags Tracked</div><div className="mt-2 text-2xl font-semibold text-white">{Number(activationTimeline?.flagHistory?.observed || 0)}</div></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Flag Transitions</div><div className="mt-2 text-2xl font-semibold text-fuchsia-300">{Number(activationTimeline?.flagHistory?.transitionsThisSweep || 0)}</div></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Dormant → Live</div><div className="mt-2 text-2xl font-semibold text-red-300">{Number(activationTimeline?.dormantActive?.routeTransitionsThisSweep || 0) + Number(activationTimeline?.dormantActive?.apiTransitionsThisSweep || 0)}</div></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Recent Domains</div><div className="mt-2 text-2xl font-semibold text-cyan-300">{Number(activationTimeline?.recent?.domainCount || 0)}</div></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">New Events</div><div className="mt-2 text-2xl font-semibold text-orange-300">{newTimelineEvents.length}</div></div>
          </div>

          {recentTimelineEvents.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Rolling 60-minute sequence</div>
              <div className="space-y-2">
                {recentTimelineEvents.slice().reverse().slice(0, 12).map((event: any, index: number) => (
                  <div key={`${event.id || event.type}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-200">{shortEventType(event.type)}</div>
                      <div className="mt-1 break-all font-mono text-[10px] text-slate-500">{event.subject || event.detail || event.domain}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[10px]">
                      <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-cyan-300">{event.domain}</span>
                      <span className="font-mono text-slate-500">{event.seenAt ? new Date(event.seenAt).toLocaleString() : "—"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 text-[11px] leading-5 text-slate-500">{activationTimeline.caution}</div>
        </div>
      )}

      {routeApi && (
        <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300">Route + API Discovery v2</div>
              <div className="mt-1 text-xs text-slate-500">Learns same-origin surfaces from HTML, bundles, and runtime API traffic, then tracks dormant → live transitions.</div>
            </div>
            <span className={`w-fit rounded-full border px-3 py-1 text-[10px] font-semibold ${dormantToLive.length ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
              {dormantToLive.length ? `${dormantToLive.length} ACTIVATED` : "NO NEW ACTIVATION"}
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Discovered</div><div className="mt-2 text-2xl font-semibold text-white">{Number(routeApi?.discovered?.total || 0)}</div></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Fresh</div><div className="mt-2 text-2xl font-semibold text-cyan-300">{freshSurface.length}</div></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Live APIs</div><div className="mt-2 text-2xl font-semibold text-orange-300">{liveApi.length}</div></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Dormant → Live</div><div className="mt-2 text-2xl font-semibold text-red-300">{dormantToLive.length}</div></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Live → Dormant</div><div className="mt-2 text-2xl font-semibold text-slate-300">{liveToDormant.length}</div></div>
          </div>

          {dormantToLive.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Activated surfaces</div>
              {dormantToLive.slice(0, 10).map((item: any) => (
                <div key={`${item.kind}-${item.route}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 py-3">
                  <div className="font-mono text-xs text-slate-200">{item.route}</div>
                  <div className="flex gap-2 text-[10px]">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-300">{item.kind}</span>
                    <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-1 text-red-300">HTTP {item.lastStatus ?? "runtime"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {freshSurface.length > 0 && dormantToLive.length === 0 && (
            <div className="mt-4 flex flex-wrap gap-2 text-[10px]">
              {freshSurface.slice(0, 12).map((item: any) => (
                <span key={`${item.kind}-${item.route}`} className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 font-mono text-cyan-300">{item.kind} {item.route}</span>
              ))}
            </div>
          )}

          <div className="mt-3 text-[11px] leading-5 text-slate-500">{routeApi.interpretation || "No transition summary available."} API probes use HEAD unless the endpoint was already observed in runtime traffic; dynamic templates are recorded but not actively probed.</div>
        </div>
      )}

      {semanticChange && (
        <div className="mt-4 rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/[0.03] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-fuchsia-300">Semantic Change Score</div>
              <div className="mt-1 text-xs text-slate-500">Separates routine bundle churn from changes carrying activation-relevant meaning.</div>
            </div>
            <span className={`w-fit rounded-full border px-3 py-1 text-[10px] font-semibold ${semanticTone(semanticChange.level)}`}>
              {semanticChange.level || "BASELINE"} · {Number(semanticChange.score || 0)}/100
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Classification</div><div className="mt-2 text-sm font-semibold text-white">{String(semanticChange.classification || "UNKNOWN").replaceAll("_", " ")}</div></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Structural</div><div className="mt-2 text-2xl font-semibold text-slate-200">{Number(semanticChange.components?.structural || 0)}</div></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Semantic</div><div className="mt-2 text-2xl font-semibold text-cyan-300">{Number(semanticChange.components?.semantic || 0)}</div></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Activation</div><div className="mt-2 text-2xl font-semibold text-orange-300">{Number(semanticChange.components?.activation || 0)}</div></div>
          </div>

          {semanticEvidence.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">High-value evidence</div>
              <div className="flex flex-wrap gap-2 text-[10px]">
                {semanticEvidence.slice(0, 16).map((item: string) => <span key={item} className="rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 px-2 py-1 text-fuchsia-300">{item}</span>)}
              </div>
            </div>
          )}

          {semanticReasons.length > 0 && <div className="mt-3 text-[11px] leading-5 text-slate-400">{semanticReasons.slice(0, 4).join(" ")}</div>}
        </div>
      )}

      {hasBundleEvidence && (
        <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.03] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div><div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300">Bundle Diff Intelligence</div><div className="mt-1 text-xs text-slate-500">Explains what changed behind the frontend fingerprint instead of treating a build change as a black box.</div></div>
            <span className={`w-fit rounded-full border px-3 py-1 text-[10px] font-semibold ${bundleDiff?.status === "DRIFT" ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>{bundleDiff?.status || "BASELINE"}</span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Added Bundles</div><div className="mt-2 text-2xl font-semibold text-cyan-300">{addedBundles.length}</div></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Changed Bundles</div><div className="mt-2 text-2xl font-semibold text-yellow-300">{changedBundles.length}</div></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Removed Bundles</div><div className="mt-2 text-2xl font-semibold text-slate-300">{removedBundles.length}</div></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">New API Routes</div><div className="mt-2 text-2xl font-semibold text-orange-300">{addedApiRoutes.length}</div></div>
          </div>

          {changedBundles.length > 0 && <div className="mt-4 space-y-2">{changedBundles.slice(0, 8).map((bundle: any, index: number) => <div key={`${bundle.key}-${index}`} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0 break-all font-mono text-xs text-slate-300">{bundle.key || bundle.url || "unknown bundle"}</div><div className="text-[10px] text-slate-500">{shortHash(bundle.previousSha256)} → {shortHash(bundle.currentSha256)} · Δ {Number(bundle.sizeDelta || 0).toLocaleString()} bytes</div></div></div>)}</div>}

          {(addedApiRoutes.length > 0 || addedRoutes.length > 0 || addedKeywords.length > 0 || addedFlags.length > 0) && <div className="mt-4 flex flex-wrap gap-2 text-[10px]">{addedApiRoutes.slice(0, 8).map((value: string) => <span key={`api-${value}`} className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-1 text-orange-300">API {value}</span>)}{addedKeywords.slice(0, 10).map((value: string) => <span key={`kw-${value}`} className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-1 text-yellow-300">{value}</span>)}{addedFlags.slice(0, 10).map((value: string) => <span key={`flag-${value}`} className="rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-purple-300">FLAG {value}</span>)}</div>}

          {removedApiRoutes.length > 0 && <div className="mt-3 text-[11px] text-slate-500">Removed API references: {removedApiRoutes.slice(0, 8).join(", ")}</div>}
        </div>
      )}

      {!!dormantRoutes.length && <div className="mt-4"><div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">Dormant Routes</div><div className="space-y-2">{dormantRoutes.map((route, index) => <div key={`${route.route || "unknown"}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3"><div className="font-mono text-sm text-slate-200">{route.route || "Unknown route"}</div><div className="flex items-center gap-2"><span className="text-xs text-slate-500">HTTP</span><span className="rounded-full border border-slate-500/20 bg-slate-500/10 px-2 py-1 font-mono text-xs text-slate-300">{route.status ?? "—"}</span></div></div>)}</div></div>}

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-slate-500">Route/API, timeline, semantic, and bundle-diff evidence is observational. Reachability, temporal proximity, or code references do not by themselves prove activation, claim readiness, causality, or launch readiness.</div>
    </div>
  )
}

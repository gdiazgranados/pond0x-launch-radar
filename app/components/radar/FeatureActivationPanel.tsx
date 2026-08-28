import type { RadarData } from "../../types/radar"
import { SectionTitle } from "./SectionTitle"

function getClassificationStyle(classification?: string) {
  switch (classification) {
    case "FEATURE_ACTIVATION_CANDIDATE":
      return {
        badge: "border-red-500/30 bg-red-500/10 text-red-300",
        text: "text-red-300",
        dot: "bg-red-400",
      }
    case "FEATURE_ACTIVATION_CONVERGENCE":
      return {
        badge: "border-amber-500/30 bg-amber-500/10 text-amber-300",
        text: "text-amber-300",
        dot: "bg-amber-400",
      }
    case "FEATURE_SURFACE_TRANSITION":
    case "BUNDLE_SURFACE_DRIFT":
      return {
        badge: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
        text: "text-cyan-300",
        dot: "bg-cyan-400",
      }
    case "DORMANT_FEATURE_SURFACE":
      return {
        badge: "border-slate-500/30 bg-slate-500/10 text-slate-300",
        text: "text-slate-300",
        dot: "bg-slate-400",
      }
    default:
      return {
        badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        text: "text-emerald-300",
        dot: "bg-emerald-400",
      }
  }
}

function shortHash(value?: string | null) {
  if (!value) return "—"
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-8)}` : value
}

export function FeatureActivationPanel({ data }: { data?: RadarData | null }) {
  const evidence = data?.featureActivationEvidence
  const intelligence = evidence as any
  const bundleDiff = intelligence?.bundleDiff || null

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

  const hasBundleEvidence =
    bundleDiff?.comparable === true ||
    Number(intelligence?.bundleCount || 0) > 0

  return (
    <div className="rounded-3xl border border-white/10 bg-[#05070a] p-4 sm:p-5 xl:col-span-12">
      <SectionTitle
        title="Feature Activation Intelligence"
        subtitle="Production feature-state, bundle-diff, and dormant-route monitoring"
        right={
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${style.badge}`}>
            {classification}
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
            Current State
          </div>

          <div className="mt-3 flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full ${style.dot}`} />
            <div className={`text-xl font-semibold ${style.text}`}>{classification}</div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Build / Bundle Fingerprint
              </div>
              <div className="mt-2 break-all font-mono text-sm text-slate-200">
                {evidence?.currentBuildId || "UNKNOWN"}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {evidence?.buildChanged ? "Fingerprint changed" : "Fingerprint stable"}
                {intelligence?.buildIdSource ? ` · ${String(intelligence.buildIdSource).replaceAll("_", " ")}` : ""}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Previous Build
              </div>
              <div className="mt-2 break-all font-mono text-sm text-slate-200">
                {evidence?.previousBuildId || "UNKNOWN"}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Comparable {evidence?.comparable ? "YES" : "NO"} · {Number(intelligence?.bundleCount || 0)} bundles
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Unlocks</div>
            <div className="mt-2 text-3xl font-semibold text-white">{unlockedFlags.length}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Activated Routes</div>
            <div className="mt-2 text-3xl font-semibold text-white">{activatedRoutes.length}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Convergence</div>
            <div className={`mt-2 text-xl font-semibold ${evidence?.convergence ? "text-amber-300" : "text-slate-300"}`}>
              {evidence?.convergence ? "YES" : "NO"}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Activation Cluster</div>
            <div className={`mt-2 text-xl font-semibold ${evidence?.activationCluster ? "text-red-300" : "text-slate-300"}`}>
              {evidence?.activationCluster ? "YES" : "NO"}
            </div>
          </div>
        </div>
      </div>

      {hasBundleEvidence && (
        <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.03] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
                Bundle Diff Intelligence
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Explains what changed behind the frontend fingerprint instead of treating a build change as a black box.
              </div>
            </div>
            <span className={`w-fit rounded-full border px-3 py-1 text-[10px] font-semibold ${
              bundleDiff?.status === "DRIFT"
                ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            }`}>
              {bundleDiff?.status || "BASELINE"}
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Added Bundles</div>
              <div className="mt-2 text-2xl font-semibold text-cyan-300">{addedBundles.length}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Changed Bundles</div>
              <div className="mt-2 text-2xl font-semibold text-yellow-300">{changedBundles.length}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Removed Bundles</div>
              <div className="mt-2 text-2xl font-semibold text-slate-300">{removedBundles.length}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">New API Routes</div>
              <div className="mt-2 text-2xl font-semibold text-orange-300">{addedApiRoutes.length}</div>
            </div>
          </div>

          {changedBundles.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Changed bundle details</div>
              <div className="space-y-2">
                {changedBundles.slice(0, 8).map((bundle: any, index: number) => (
                  <div key={`${bundle.key}-${index}`} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 break-all font-mono text-xs text-slate-300">{bundle.key || bundle.url || "unknown bundle"}</div>
                      <div className="text-[10px] text-slate-500">
                        {shortHash(bundle.previousSha256)} → {shortHash(bundle.currentSha256)} · Δ {Number(bundle.sizeDelta || 0).toLocaleString()} bytes
                      </div>
                    </div>
                    {(bundle.addedApiRoutes?.length > 0 || bundle.addedRoutes?.length > 0 || bundle.addedKeywords?.length > 0 || bundle.addedFlags?.length > 0) && (
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                        {(bundle.addedApiRoutes || []).slice(0, 4).map((value: string) => (
                          <span key={`api-${value}`} className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-1 text-orange-300">API {value}</span>
                        ))}
                        {(bundle.addedRoutes || []).filter((value: string) => !(bundle.addedApiRoutes || []).includes(value)).slice(0, 4).map((value: string) => (
                          <span key={`route-${value}`} className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-cyan-300">ROUTE {value}</span>
                        ))}
                        {(bundle.addedKeywords || []).slice(0, 6).map((value: string) => (
                          <span key={`kw-${value}`} className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-1 text-yellow-300">{value}</span>
                        ))}
                        {(bundle.addedFlags || []).slice(0, 6).map((value: string) => (
                          <span key={`flag-${value}`} className="rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-purple-300">FLAG {value}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(addedApiRoutes.length > 0 || addedRoutes.length > 0 || addedKeywords.length > 0 || addedFlags.length > 0) && (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">New semantic surface</div>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                  {addedApiRoutes.slice(0, 8).map((value: string) => (
                    <span key={`global-api-${value}`} className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-1 text-orange-300">API {value}</span>
                  ))}
                  {addedRoutes.filter((value: string) => !addedApiRoutes.includes(value)).slice(0, 8).map((value: string) => (
                    <span key={`global-route-${value}`} className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-cyan-300">{value}</span>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">New signals in bundles</div>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                  {addedKeywords.slice(0, 10).map((value: string) => (
                    <span key={`global-kw-${value}`} className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-1 text-yellow-300">{value}</span>
                  ))}
                  {addedFlags.slice(0, 10).map((value: string) => (
                    <span key={`global-flag-${value}`} className="rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-purple-300">FLAG {value}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {removedApiRoutes.length > 0 && (
            <div className="mt-3 text-[11px] text-slate-500">
              Removed API references: {removedApiRoutes.slice(0, 8).join(", ")}
            </div>
          )}
        </div>
      )}

      {!!dormantRoutes.length && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">Dormant Routes</div>
          <div className="space-y-2">
            {dormantRoutes.map((route, index) => (
              <div key={`${route.route || "unknown"}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="font-mono text-sm text-slate-200">{route.route || "Unknown route"}</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">HTTP</span>
                  <span className="rounded-full border border-slate-500/20 bg-slate-500/10 px-2 py-1 font-mono text-xs text-slate-300">
                    {route.status ?? "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-slate-500">
        Bundle-diff evidence is observational. A changed bundle, route reference, keyword, or feature flag is not by itself proof of launch readiness and does not directly affect Radar Score.
      </div>
    </div>
  )
}

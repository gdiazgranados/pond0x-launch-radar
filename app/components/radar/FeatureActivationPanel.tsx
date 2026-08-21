import type { RadarData } from "../../types/radar"
import { SectionTitle } from "./SectionTitle"

function getClassificationStyle(classification?: string) {
  switch (classification) {
    case "FEATURE_ACTIVATION_CANDIDATE":
      return {
        badge:
          "border-red-500/30 bg-red-500/10 text-red-300",
        text:
          "text-red-300",
        dot:
          "bg-red-400",
      }

    case "FEATURE_ACTIVATION_CONVERGENCE":
      return {
        badge:
          "border-amber-500/30 bg-amber-500/10 text-amber-300",
        text:
          "text-amber-300",
        dot:
          "bg-amber-400",
      }

    case "FEATURE_SURFACE_TRANSITION":
      return {
        badge:
          "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
        text:
          "text-cyan-300",
        dot:
          "bg-cyan-400",
      }

    case "DORMANT_FEATURE_SURFACE":
      return {
        badge:
          "border-slate-500/30 bg-slate-500/10 text-slate-300",
        text:
          "text-slate-300",
        dot:
          "bg-slate-400",
      }

    default:
      return {
        badge:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        text:
          "text-emerald-300",
        dot:
          "bg-emerald-400",
      }
  }
}

export function FeatureActivationPanel({
  data,
}: {
  data?: RadarData | null
}) {
  const evidence =
    data?.featureActivationEvidence

  const classification =
    evidence?.classification ||
    "UNKNOWN"

  const style =
    getClassificationStyle(
      classification
    )

  const dormantRoutes =
    evidence?.observedDormantRoutes ||
    []

  const activatedRoutes =
    evidence?.activatedRoutes ||
    []

  const unlockedFlags =
    evidence?.unlockedFlags ||
    []

  return (
    <div className="rounded-3xl border border-white/10 bg-[#05070a] p-4 sm:p-5 xl:col-span-12">
      <SectionTitle
        title="Feature Activation Intelligence"
        subtitle="Production feature-state and dormant-route monitoring"
        right={
          <span
            className={`rounded-full border px-3 py-1 text-xs font-medium ${style.badge}`}
          >
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
            <span
              className={`h-3 w-3 rounded-full ${style.dot}`}
            />

            <div
              className={`text-xl font-semibold ${style.text}`}
            >
              {classification}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Build
              </div>

              <div className="mt-2 break-all font-mono text-sm text-slate-200">
                {evidence?.currentBuildId ||
                  "UNKNOWN"}
              </div>

              <div className="mt-1 text-xs text-slate-500">
                {evidence?.buildChanged
                  ? "Build changed"
                  : "Build stable"}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Previous Build
              </div>

              <div className="mt-2 break-all font-mono text-sm text-slate-200">
                {evidence?.previousBuildId ||
                  "UNKNOWN"}
              </div>

              <div className="mt-1 text-xs text-slate-500">
                Comparable{" "}
                {evidence?.comparable
                  ? "YES"
                  : "NO"}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
              Unlocks
            </div>

            <div className="mt-2 text-3xl font-semibold text-white">
              {unlockedFlags.length}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
              Activated Routes
            </div>

            <div className="mt-2 text-3xl font-semibold text-white">
              {activatedRoutes.length}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
              Convergence
            </div>

            <div
              className={`mt-2 text-xl font-semibold ${
                evidence?.convergence
                  ? "text-amber-300"
                  : "text-slate-300"
              }`}
            >
              {evidence?.convergence
                ? "YES"
                : "NO"}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
              Activation Cluster
            </div>

            <div
              className={`mt-2 text-xl font-semibold ${
                evidence?.activationCluster
                  ? "text-red-300"
                  : "text-slate-300"
              }`}
            >
              {evidence?.activationCluster
                ? "YES"
                : "NO"}
            </div>
          </div>
        </div>
      </div>

      {!!dormantRoutes.length && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">
            Dormant Routes
          </div>

          <div className="space-y-2">
            {dormantRoutes.map(
              (route, index) => (
                <div
                  key={`${route.route || "unknown"}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3"
                >
                  <div className="font-mono text-sm text-slate-200">
                    {route.route ||
                      "Unknown route"}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">
                      HTTP
                    </span>

                    <span className="rounded-full border border-slate-500/20 bg-slate-500/10 px-2 py-1 font-mono text-xs text-slate-300">
                      {route.status ?? "—"}
                    </span>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-slate-500">
        Feature-surface evidence is currently observational and does not directly affect Radar Score.
      </div>
    </div>
  )
}

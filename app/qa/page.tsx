import EcosystemNavigation from "../../components/ecosystem-navigation"

const sections = [
  {
    title: "Scores and interpretation",
    items: [
      {
        question: "Why can the Radar Score exceed 100?",
        answer:
          "Radar Score displays the producer's raw activity score. It is a points-based heuristic, not a percentage. The producer explicitly supports values above 100 and marks overdrive when rawScore > 100. A score of 144 does not mean a 144% launch probability.",
      },
      {
        question: "How is Intensity different from Score?",
        answer:
          "Intensity displays the producer's scorePercent field on a scale presented as /100. Score displays the raw points. These are separate fields: intensity is not a measured probability, and reaching 100 does not establish that a launch or claim is ready.",
      },
      {
        question: "What determines the raw-score severity bands?",
        answer:
          "The producer includes these raw-score thresholds: MEDIUM at 15, HIGH at 40, VERY HIGH at 70, and CRITICAL at 100. These describe heuristic intensity. Other labels and decision modules have their own rules and must not be treated as interchangeable.",
      },
      {
        question: "Is Launch Probability a statistical probability?",
        answer:
          "No. The display helper returns categories using tags, the producer level, and fallback thresholds. LAUNCH_IMMINENT returns CRITICAL; otherwise PORTAL_ARMED returns VERY HIGH. A recognized producer level normally determines the category after the empty-state check. These rules do not measure a calibrated chance of launch.",
      },
      {
        question: "Does ACTIVATION or LAUNCH_IMMINENT confirm a launch?",
        answer:
          "No. The legacy display palette maps CRITICAL to ACTIVATION, and pattern names describe rules that matched. Even a pattern named CONFIRMED_ACTIVATION is not proof of public access, claim readiness, reward eligibility, or a successful user transaction. Inspect the underlying evidence and its scope.",
      },
    ],
  },
  {
    title: "Patterns and bonuses",
    items: [
      {
        question: "Which bonuses does the pattern detector emit?",
        answer:
          "PRE-ACTIVATION: +15; REWARD_PREP: +20; INFRA_STAGING: +10; UI_ARMING: +12; BEHAVIOR_SPIKE: +10; CONFIRMED_ACTIVATION: +25; LAUNCH_IMMINENT: +30. Multiple patterns may match. These are detector bonuses, not percentages or a complete formula for the final Radar Score.",
      },
      {
        question: "What triggers the LAUNCH_IMMINENT pattern?",
        answer:
          "The detector requires frontendScore >= 70, rewardsScore >= 60, behaviorScore >= 55, plus fresh evidence. Its freshness condition is at least three recent surface changes OR onchainFresh === true together with hasOnchainMovement === true. The resulting name is a heuristic label, not a launch announcement or deadline.",
      },
      {
        question: "Does finding reward or wallet code prove it is usable?",
        answer:
          "No. Strings, routes, flags, and interface references can exist before a feature is publicly usable. Static presence, observed state changes, successful runtime behavior, and a completed user action are different levels of evidence.",
      },
    ],
  },
  {
    title: "Evidence Confidence",
    items: [
      {
        question: "How is Evidence Confidence calculated?",
        answer:
          "Events receive rule-based source scores and are sorted by confidence. The top five use weights 0.38, 0.25, 0.17, 0.12, and 0.08, divided by the sum of weights actually used. A bonus adds 1.5 points per additional distinct domain, capped at 6. The result is rounded and bounded to 0–100. No events returns 0 with NO_EVIDENCE.",
      },
      {
        question: "What are the source scores?",
        answer:
          "Defaults include distributor transfers 97, new recipients 95, on-chain activity 94, unlocked flags 88, dormant-to-live APIs 86, dormant-to-live routes 78, and material semantic changes 58. Runtime-observed APIs have a minimum of 94. Numeric HTTP statuses from 200 through 399 set a minimum of 88 for APIs or 82 for routes; statuses of 400 or above cap those scores at 76.",
      },
      {
        question: "What does a high confidence value actually mean?",
        answer:
          "It means the rules rate the observed evidence highly. It is not a measured probability that the observation predicts a launch. The aggregation counts distinct domains, but does not itself prove that observations are independent or causally related.",
      },
      {
        question: "How are confidence levels assigned?",
        answer:
          "VERY_HIGH starts at 90, HIGH at 80, MEDIUM at 65, and LOW at 45. Lower positive evidence scores are VERY_LOW. The no-events case is separately labeled NO_EVIDENCE.",
      },
    ],
  },
  {
    title: "Activation Decision",
    items: [
      {
        question: "What makes a CRITICAL_ACTIVATION_CANDIDATE?",
        answer:
          "Default gates require an activation-like transition, distributor or recipient evidence, activation score >= 70, correlation >= 65, evidence confidence >= 85, and at least four recent domains. Threshold overrides can change these defaults. This state identifies a candidate for investigation, not a confirmed public launch.",
      },
      {
        question: "What do the other decision states mean?",
        answer:
          "Using default thresholds, HIGH_CONFIDENCE_CONVERGENCE requires correlation >= 55, confidence >= 80, at least three domains, and activation or runtime/state evidence. RUNTIME_ACTIVATION requires an activation-like transition and confidence >= 70. STRUCTURAL_CHANGE requires semantic score >= 35. Otherwise positive input scores produce WATCH; all-zero inputs produce QUIET. Rules are evaluated in that order.",
      },
      {
        question: "How is Decision Strength calculated?",
        answer:
          "QUIET returns 0. Otherwise the engine rounds 0.55 × max(correlation, activation) + 0.35 × confidence + 0.10 × min(semantic, 60), capped at 100. Inputs are bounded to 0–100. Decision Strength summarizes evidence inputs; it is not a launch probability.",
      },
    ],
  },
  {
    title: "Semantic change and freshness",
    items: [
      {
        question: "What is the Semantic Change Score?",
        answer:
          "It adds structural changes, weighted semantic additions, observed flag/route transitions, and a convergence bonus, then bounds the total to 0–100 and rounds to one decimal. Two distinct high-value evidence entries add 6 points; three or more add 12. Material change starts at 35. Without a comparable baseline, it returns 0 and BASELINE.",
      },
      {
        question: "What are the semantic severity thresholds?",
        answer:
          "CRITICAL starts at 80, HIGH at 60, MEDIUM at 35, and LOW at 15; lower scores are TRIVIAL. A semantic CRITICAL label describes changes in monitored material, not confirmation that the product is live.",
      },
      {
        question: "How does the heartbeat freshness helper work?",
        answer:
          "It compares the timestamp age with the configured schedule plus 15 minutes of grace. FRESH lasts through schedule + 15 minutes; LAGGING lasts through 2 × schedule + 15 minutes; older data is STALE. For a 60-minute schedule, the boundaries are 75 and 135 minutes. An unavailable or unparseable timestamp returns UNKNOWN.",
      },
      {
        question: "Does healthy monitoring mean Pond0x has launched?",
        answer:
          "No. Monitoring health concerns collection and reporting. A working monitor can observe dormant features or no changes. Always separate the condition of the monitoring system from the condition of the product it watches.",
      },
    ],
  },
]

export default function RadarQAPage() {
  return (
    <main className="min-h-screen bg-[#020406] text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <EcosystemNavigation current="qa" site="radar" />

        <header className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
            Pond0x Signal Terminal
          </p>
          <h1 className="mt-3 text-3xl font-semibold">
            Indicators Q&A
          </h1>
          <p className="mt-3 leading-7 text-slate-300">
            Understand the rules, evidence, and limitations behind the Radar.
            Activity points, evidence confidence, and activation decisions
            answer different questions.
          </p>
          <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm leading-6 text-amber-200">
            No indicator on this page establishes a launch date, claim
            readiness, reward eligibility, or a calibrated launch probability.
          </p>
          <p className="mt-4 text-xs leading-5 text-slate-400">
            Initial coverage: verified display rules, pattern bonuses,
            evidence confidence, activation decisions, semantic change,
            and heartbeat freshness. Full raw-score normalization and
            remaining panel-specific formulas are not yet documented here.
          </p>
        </header>

        <div className="mt-8 space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="mb-3 text-xl font-semibold">
                {section.title}
              </h2>
              <div className="space-y-3">
                {section.items.map((item) => (
                  <details
                    key={item.question}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    <summary className="cursor-pointer font-medium text-cyan-100">
                      {item.question}
                    </summary>
                    <p className="mt-3 text-sm leading-7 text-slate-300">
                      {item.answer}
                    </p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-10 border-t border-white/10 pt-5 text-xs leading-6 text-slate-400">
          Methodology sources: app/lib/radar.ts, watcher/radar.js,
          watcher/lib/pattern-engine.js, watcher/lib/evidence-confidence.js,
          watcher/lib/activation-decision-engine.js, and
          watcher/lib/semantic-change-score.js. Default rules may differ
          from runtime overrides. This guide does not change scoring.
        </footer>
      </div>
    </main>
  )
}
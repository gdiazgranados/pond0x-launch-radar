# Shared evidence strategy — observation release

This replaces two independent Telegram interpretations with one persisted event evaluation.
**This release contains no live Telegram transport. Both legacy senders are disabled.**
Merging it pauses their outgoing alerts, while keeping data collection and the existing hourly schedule.
The Telegram health probe still checks bot/chat reachability; it does not send messages.

## Rules in this release

- A single `FUNDS_MOVEMENT` event groups new successful parsed wPOND transfers within the collection interval. Three or more reward-wallet transfers qualify for a simulated summary; any new upstream funding or external recipient transfer also qualifies. Smaller reward-only groups remain observations. Thresholds are provisional and must be evaluated against captured data before live activation.
- IDs use transaction signature plus the token-transfer array index. Duplicate RPC records are collapsed without collapsing two identical transfers at different indices. The producer excludes transactions with `transactionError` and captures evidence before the display's 20-row truncation.
- Web candidates require a comparable observed access transition (known unsuccessful status to 2xx) or an unlocked relevant flag. Keyword presence, builds, scores, prediction windows and historical patterns alone cannot trigger.
- A successful route response or unlocked flag is evidence of that specific transition, not proof that rewards can be claimed. On-chain transfers are evidence of funds movement, not proof of user payouts or claim availability.
- Co-occurrence in the same sweep, within 15 minutes of the chain cutoff, is context on the two source events; it is not a third alert or a causal claim. Cross-sweep semantic correlation and notification consolidation remain future work.
- Missing/stale evidence, incomplete pagination and truncated history block chain event evaluation without advancing its cursor. A monitoring incident qualifies after two distinct problematic samples, once per incident. A stopped workflow cannot detect its own outage; external liveness monitoring is not provided here.
- Freshness ceiling is 90 minutes, aligned with hourly collection. The event states its exact interval and observation time; it is not a live feed.

## Shared records

`evidence-ledger.json` contains the current coverage/context and the 200 most recent events. Every event includes the frozen message preview, decision reason, rule version, exact supporting transfers or before/after web observations, and `OBSERVATION_ONLY` delivery state. The web does not recalculate notification eligibility.

`evidence-events/<id>.json` preserves each full event for `/events/<id>`. Existing event records are reused on a retry, including if a previous run wrote the archive but failed before writing state. There is no automatic archive deletion in this release; monitor its growth before enabling long-term retention.

`evidence-sweeps/<id>.json` captures the minimal exact evaluator input, including quiet sweeps, for later replay. `evidence-state.json` contains evaluation cursors, transfer identities for 48 hours, and health incident state. These are evaluation cursors, **not delivery acknowledgements**.

The full workflow publishes events, sweeps, ledger and state in one git commit to `radar-data`. The chain-only workflow uses the same writer concurrency group and marks web context `NOT_EVALUATED` instead of reusing stale web changes. Website fetches may still lag publication, but there is no outgoing transport in this release.

The dashboard's main view no longer applies the client-side launch-score boost or separate Alpha evaluation. Other legacy analytics remain labeled as heuristic context; they do not control the new decisions. A statistical funding window no longer counts as a fresh on-chain trigger. Historical delivery history reads `alerts-history.json`, never Sentinel observations, and explicitly excludes the old chain sender which did not keep a complete delivery log.

## Verification

```sh
npm ci
npm ci --prefix watcher
node --test watcher/tests/evidence-events.test.js watcher/tests/chain-alert-window.test.js
npm run build
node watcher/replay-evidence.js /path/to/captured/evidence-sweeps
```

A replay can also read an array of `{chain, latest, observedAt, chainOnly}` samples. Historical rolling aggregates without exact interval evidence produce an unknown exact total, not zero alerts. The original 725-record chain-history export available during implementation could not support an exact replay.

## Before production activation

1. Review/deploy the observation release and verify the event detail route on the public site. Merging changes workflows immediately; deploy the dashboard in coordination.
2. Collect representative quiet and active sweeps. Replay them and inspect every qualifying event, coverage gaps, duplicates, and message/page equality. Do not enable live sending merely because a fixed number of hours has passed without activity.
3. Tune relevance thresholds with that evidence. Backfill or explicitly rebaseline any gap exceeding the 24-hour fetch horizon; never silently call the missed interval quiet.
4. Add a sender that consumes only published eligible events, verifies the public detail record is available and matches, and uses the stored message. Persist pending/sent/failed or uncertain-delivery state independently of evaluation cursors. Do not replay the entire observation backlog into Telegram.
5. Test the delivery failure/retry path and then explicitly enable sending. Telegram does not offer a general exactly-once idempotency guarantee; an accepted message followed by a failed state write needs reconciliation, not an unconditional resend.

No bot token or chat ID is needed for observation evaluation or replay. No real messages were sent during implementation.

## Implementation validation (2026-08-30)

- 24 focused tests pass, including interval coverage, evidence identity, retries after partial persistence, no prediction-only alerts, historical replay refusal, and disabled legacy entrypoints.
- Full suite: 104 tests, 99 pass, 5 fail in `onchain-state.test.js`. The unchanged pre-implementation head reproduces all five failures (91 tests, 86 pass, 5 fail): expected fixtures omit fields already returned by `normalizeOnchainState`. This release does not change that module or those assertions.
- Next.js production build and TypeScript pass. This environment required `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1` for Google Fonts TLS; no repository TLS setting was changed.
- Local HTTP integration with synthetic fixtures: API ledger message equals server-rendered event preview exactly; transaction detail is present; legacy delivery history contains its three recorded sends; homepage returns 200; invalid event ID returns 404.
- New TSX/type files pass targeted ESLint; both workflow YAML files parse.
- Visual/hydration verification is pending: agent-browser could not start, and Chromium installation was blocked by certificate/download failures in this environment. Do not treat the HTTP check as a browser test.
- No production deployment, workflow dispatch, or Telegram send performed. Public archive availability must be checked after observation deployment and before implementing/enabling live delivery.

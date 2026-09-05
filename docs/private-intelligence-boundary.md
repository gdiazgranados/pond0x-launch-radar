# Private Intelligence Boundary and Shadow Portfolio V1

## Decision

Pond0x Launch Radar uses a hybrid model:

- Public outputs contain factual, reproducible observations.
- Private intelligence contains strategy, opportunity ranking, simulated positions and performance.
- Public surfaces never publish BUY/SELL instructions.
- Private intelligence never changes the public Radar score, activation decision or Telegram alerts.

## Public inputs

The private layer may consume these score-neutral public artifacts:

- `token-market-latest.json`
- `token-market-history.json`
- `token-market-trends-latest.json`
- `ecosystem-snapshot-latest.json`
- `ecosystem-snapshot-history.json`
- `clear-intelligence.json`
- `chain-intelligence.json`
- `mining-intelligence.json`
- `swap-observation.json`

These files may expose factual price, pool, liquidity, rolling volume, transaction and protocol-state observations.

## Private-only outputs

The following must never be written under `public/`, `public/data/`, `data/`, the `radar-data` branch, client bundles or unauthenticated API responses:

- Alpha Engine weights, thresholds and rules
- opportunity ranks or confidence scores
- BUY/SELL/ENTER/EXIT conclusions
- position sizing
- wallet balances or holdings
- Shadow Portfolio positions, fills and P&L
- private alerts and operator notes
- strategy evaluation, win rate and drawdown
- API credentials or private wallet identifiers

Private output names should use an explicit namespace such as `private-alpha/*` and be served only after server-side authorization.

## Authentication boundary

Private endpoints must:

1. authenticate the request server-side;
2. match the authenticated identity against an explicit superuser allowlist;
3. return `401` when unauthenticated and `403` when authenticated but unauthorized;
4. avoid `NEXT_PUBLIC_*` secrets and client-side authorization decisions;
5. set `Cache-Control: private, no-store`;
6. exclude private payloads from logs and analytics;
7. keep public fallback data free of private fields.

Authentication design and storage provider are intentionally not selected in this document.

## Shadow Portfolio V1 contract

Shadow Portfolio V1 is simulation only. It cannot sign, route or submit a transaction.

### Position

| Field | Meaning |
| --- | --- |
| `positionId` | Stable opaque identifier |
| `tokenId` | PNDC, PORK, wPOND or PAPER |
| `chain` | Ethereum or Solana |
| `side` | Long exposure only in V1 |
| `status` | PROPOSED, OPEN, CLOSED, INVALIDATED |
| `openedAt` / `closedAt` | Decision timestamps |
| `entryReferenceUsd` / `exitReferenceUsd` | Same-pair factual reference prices |
| `notionalUsd` | Hypothetical capital |
| `estimatedEntrySlippagePct` / `estimatedExitSlippagePct` | Size-aware simulation assumptions |
| `estimatedFeesUsd` | Simulated fees |
| `realizedPnlUsd` / `realizedPnlPct` | Simulated result after costs |
| `maxAdverseExcursionPct` | Worst observed move while open |
| `maxFavorableExcursionPct` | Best observed move while open |
| `evidenceRefs` | Immutable source timestamps and pair addresses |
| `ruleVersion` | Private Alpha rule version |
| `invalidationReason` | Why a proposal or position stopped being valid |
| `operatorNote` | Private note |

### Required evidence

A proposal must preserve:

- current and baseline observation timestamps;
- current and baseline pair addresses;
- market-continuity state;
- current liquidity and rolling volume;
- requested and actual lookback hours;
- source freshness;
- explicit anomalies;
- estimated price impact for the hypothetical size.

If the pair is not comparable, the source is stale, executable liquidity is unavailable or price impact cannot be estimated, the position remains `PROPOSED` or becomes `INVALIDATED`.

## Evaluation

Before any real-money consideration, V1 must report at minimum:

- total proposals;
- opened and closed simulations;
- win rate;
- gross and net simulated P&L;
- maximum drawdown;
- average estimated slippage;
- performance by token and rule version;
- invalidation count and reasons;
- comparison against a no-action baseline.

No minimum success threshold is defined until enough observations exist. Alpha weights and decision thresholds remain private and are not part of this repository.

## Delivery phases

1. Accumulate public factual history.
2. Validate same-pair continuity and size-aware quote availability.
3. Select private server-side storage and authentication.
4. Implement the generic Shadow Portfolio state machine privately.
5. Add private Alpha rules and versioning.
6. Run simulations without execution.
7. Review performance before considering private alerts or real capital.

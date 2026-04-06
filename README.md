# 🛰️ Pond0x Launch Radar

> Real-time intelligence terminal for detecting activation signals across Pond0x surfaces.

---

## ⚡ What is this?

**Pond0x Launch Radar** is a monitoring and signal-detection system that:

* Tracks frontend changes across Pond0x surfaces
* Detects activation patterns (wallets, rewards, system readiness)
* Scores and classifies signals in real-time
* Generates alerts (Telegram)
* Visualizes everything in a terminal-style UI

---

## 🧠 System Philosophy

This is **not just a dashboard**.

It is a **dual-layer intelligence system**:

| Layer    | Role                                          |
| -------- | --------------------------------------------- |
| Backend  | Detects, scores, and classifies signals       |
| Frontend | Interprets, visualizes, and amplifies signals |

---

## 🔄 System Flow

```text
sentinel → capture → radar → discovery → notify
                      ↓
               public/data/*.json
                      ↓
                   API (/api/radar)
                      ↓
                 useRadarData()
                      ↓
                    UI
```

---

## ⚙️ Architecture

### 🛰️ Sentinel Layer

* Monitors portal surfaces
* Detects external changes
* Outputs:

  * `sentinel-events.json`
  * `sentinel-state.json`

---

### 📸 Capture Layer

* Captures HTML snapshots
* Stores historical versions for diffing

---

### 🧠 Radar Engine (Core)

* Compares snapshots
* Detects signals
* Computes:

  * Score
  * Trend
  * Movement
  * Alpha
  * Event Type
  * Signal Regime
  * Priority
  * ETA

📌 **This is the source of truth**

---

### 🧪 Discovery Layer

* Extracts visible UI signals
* Finds semantic changes

---

### 🚨 Notify Layer

* Sends Telegram alerts
* Prevents duplicates via signature
* Stores alert history

---

### 🌐 API Layer

* Aggregates JSON outputs
* Exposes unified endpoint

---

### 🎨 Frontend Terminal

* Real-time UI
* Signal tape
* Alpha panel
* Alerts + history
* Narrative layer

---

## 🧠 Intelligence Layers

### 🔴 Backend (Canonical)

Generated in `watcher/radar.js`:

* alphaScore
* alphaClass
* triggerState
* eventType
* signalRegime
* signalFusion
* priority
* eta

---

### 🟣 Frontend (Editorial)

Generated in `lib/alpha.ts` and `lib/radar.ts`:

* Narrative
* Visual prioritization
* UI interpretation
* Signal amplification

---

## 📊 Data Sources

All runtime data lives in:

```
/public/data/
```

Key files:

* `latest.json`
* `history.json`
* `alerts-history.json`
* `heartbeat.json`
* `sentinel-events.json`
* `discovery.json`

---

## 🚀 Features

* 🔍 Frontend diff detection
* 🧠 Signal classification engine
* 📈 Alpha scoring system
* 🚨 Telegram alerts
* 📊 Terminal-style dashboard
* ⚡ Real-time updates (5 min cadence)

---

## 🧪 Status

| Component       | Status       |
| --------------- | ------------ |
| Radar Engine    | ✅ Stable     |
| Alerts          | ✅ Active     |
| Sentinel        | ✅ Active     |
| UI              | ✅ Live       |
| Types alignment | ⚠️ Improving |

---

## ⚠️ Technical Notes

* Backend is the **source of truth**
* Frontend adds **interpretation layer**
* Some logic exists in both layers (intentional for UX)

---

## 🔮 Roadmap

* [ ] Full type alignment with backend contract
* [ ] Remove legacy fallbacks in hooks
* [ ] Optional: unify alpha computation
* [ ] Expand signal classification

---

## 🧩 Why this matters

This system enables:

* Early detection of product activation
* Signal-based monitoring instead of speculation
* Real-time operational awareness

---

## 🧠 Philosophy

> Data → Signals → Interpretation → Action

---

## 📡 Live Radar

👉 https://pond0x-launch-radar.vercel.app/

---

## 🛠️ Built with

* Node.js
* Playwright
* Next.js
* TypeScript
* Tailwind
* GitHub Actions

---

## ⚠️ Disclaimer

This is an experimental intelligence system.
Not financial advice.

---

## 🐽 Powered by Pond0x
vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

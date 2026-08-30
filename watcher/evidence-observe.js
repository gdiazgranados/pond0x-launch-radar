"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { evaluateEvidence } = require("./lib/evidence-events");
const { buildDistributorBehavior } = require("./lib/distributor-behavior");
async function read(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}
async function run({ dataDir = path.join(__dirname, "..", "public", "data"), now = Date.now(), chainOnly = false } = {}) {
  const [chain, latest, previous, ledger, recipients] = await Promise.all([
    read(path.join(dataDir, "chain-intelligence.json"), {}), read(path.join(dataDir, "latest.json"), {}),
    read(path.join(dataDir, "evidence-state.json"), {}), read(path.join(dataDir, "evidence-ledger.json"), { events: [] }),
    read(path.join(dataDir, "reward-recipients.json"), {})]);
  const result = evaluateEvidence({ chain, latest, previous, now, chainOnly });
  await fs.mkdir(path.join(dataDir, "evidence-events"), { recursive: true });
  const write = (name, value) => fs.writeFile(path.join(dataDir, name), JSON.stringify(value, null, 2) + "\n");
  // Archive event records before advancing the cursor. All files are published in one git commit.
  for (const [index, event] of result.events.entries()) {
    const file = path.join(dataDir, "evidence-events", `${event.id}.json`);
    try { await fs.writeFile(file, JSON.stringify(event, null, 2) + "\n", { flag: "wx" }); }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      const archived = await read(file, null);
      if (!archived || archived.id !== event.id) throw new Error("Evidence archive identity mismatch");
      result.events[index] = archived;
    }
  }
  await fs.mkdir(path.join(dataDir, "evidence-sweeps"), { recursive: true });
  const sweep = { observedAt: result.generatedAt, chainOnly,
    chain: { alertWindow: chain.alertWindow || null, entities: chain.entities || null },
    latest: { id: latest.id || null, generatedAt: latest.generatedAt || null,
      featureActivationEvidence: latest.featureActivationEvidence || null } };
  const sweepId = require("node:crypto").createHash("sha256").update(JSON.stringify([
    chain.alertWindow?.endAt || null, chainOnly ? null : latest.generatedAt || null, chainOnly])).digest("hex").slice(0, 24);
  try { await fs.writeFile(path.join(dataDir, "evidence-sweeps", `${sweepId}.json`), JSON.stringify(sweep, null, 2) + "\n", { flag: "wx" }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  const events = [...new Map([...result.events, ...(ledger.events || [])].map(event => [event.id, event])).values()]
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt)).slice(0, 200);
  await write("evidence-ledger.json", { version: 1, mode: result.mode, generatedAt: result.generatedAt,
    context: result.context, issues: result.issues, events });
  await write("distributor-intelligence.json", buildDistributorBehavior(chain, recipients));
  await write("evidence-state.json", result.state);
  console.log(`Observation only: ${result.events.length} new events; ${result.events.filter(event => event.decision.eligible).length} would notify; 0 sent`);
  return result;
}
if (require.main === module) run({ chainOnly: process.argv.includes("--chain-only") }).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { run };

"use strict";

const fs = require("fs-extra");
const path = require("path");
const { buildDecision, clamp100 } = require("./lib/activation-decision-engine");

const PUBLIC_DATA = path.join(__dirname, "..", "public", "data");
const LATEST_FILE = path.join(PUBLIC_DATA, "latest.json");
const TIMELINE_FILE = path.join(PUBLIC_DATA, "activation-timeline.json");
const OUTPUT_FILE = path.join(PUBLIC_DATA, "activation-decision.json");

async function readJson(file, fallback = {}) {
  try {
    return await fs.readJson(file);
  } catch {
    return fallback;
  }
}

async function main() {
  const latest = await readJson(LATEST_FILE, {});
  const timeline = await readJson(TIMELINE_FILE, {});

  const semantic = clamp100(latest?.featureActivationEvidence?.semanticChange?.score);
  const correlation = clamp100(latest?.evidenceCorrelation?.score);
  const confidence = clamp100(timeline?.evidenceConfidence?.score);
  const activation = clamp100(timeline?.score);

  const result = buildDecision({ semantic, correlation, confidence, activation, timeline, latest });
  await fs.ensureDir(PUBLIC_DATA);
  await fs.writeJson(OUTPUT_FILE, result, { spaces: 2 });

  console.log(
    `Activation Decision v1 | state=${result.state} strength=${result.decisionStrength} semantic=${semantic} correlation=${correlation} confidence=${confidence} activation=${activation}`
  );
}

main().catch((error) => {
  console.error("activation-decision failed:", error);
  process.exit(1);
});

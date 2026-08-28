function n(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 2) {
  const p = 10 ** digits;
  return Math.round(n(value) * p) / p;
}

function median(values) {
  const rows = values.map(n).filter(Number.isFinite).sort((a, b) => a - b);
  if (!rows.length) return null;
  const mid = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[mid] : (rows[mid - 1] + rows[mid]) / 2;
}

function windowStats(transfers, minutes, nowMs) {
  const cutoff = nowMs - minutes * 60_000;
  const rows = transfers.filter((row) => {
    const ts = Number(row?.timestamp || 0) * 1000;
    return ts >= cutoff && ts <= nowMs;
  });

  const total = rows.reduce((sum, row) => sum + n(row?.amount), 0);
  const recipients = new Set(rows.map((row) => row?.to).filter(Boolean));

  return {
    minutes,
    transfers: rows.length,
    uniqueRecipients: recipients.size,
    wpondDistributed: round(total),
    avgTransfer: rows.length ? round(total / rows.length) : 0,
    largestTransfer: round(Math.max(0, ...rows.map((row) => n(row?.amount)))),
  };
}

function compareWindows(transfers, windowMinutes, nowMs) {
  const currentStart = nowMs - windowMinutes * 60_000;
  const previousStart = nowMs - windowMinutes * 2 * 60_000;

  const current = transfers.filter((row) => {
    const ts = n(row?.timestamp) * 1000;
    return ts >= currentStart && ts <= nowMs;
  });

  const previous = transfers.filter((row) => {
    const ts = n(row?.timestamp) * 1000;
    return ts >= previousStart && ts < currentStart;
  });

  const currentVolume = current.reduce((sum, row) => sum + n(row?.amount), 0);
  const previousVolume = previous.reduce((sum, row) => sum + n(row?.amount), 0);

  const transferVelocityPct = previous.length
    ? round(((current.length - previous.length) / previous.length) * 100, 1)
    : current.length
      ? 100
      : 0;

  const volumeVelocityPct = previousVolume
    ? round(((currentVolume - previousVolume) / previousVolume) * 100, 1)
    : currentVolume
      ? 100
      : 0;

  return {
    windowMinutes,
    currentTransfers: current.length,
    previousTransfers: previous.length,
    currentVolume: round(currentVolume),
    previousVolume: round(previousVolume),
    transferVelocityPct,
    volumeVelocityPct,
  };
}

function detectBursts(transfers, maxGapMinutes = 10) {
  const ordered = [...transfers]
    .filter((row) => n(row?.timestamp) > 0)
    .sort((a, b) => n(a.timestamp) - n(b.timestamp));

  const groups = [];
  let current = [];

  for (const row of ordered) {
    if (!current.length) {
      current = [row];
      continue;
    }

    const previous = current[current.length - 1];
    const gapSeconds = n(row.timestamp) - n(previous.timestamp);

    if (gapSeconds <= maxGapMinutes * 60) {
      current.push(row);
    } else {
      if (current.length >= 2) groups.push(current);
      current = [row];
    }
  }

  if (current.length >= 2) groups.push(current);

  return groups
    .map((rows) => {
      const first = rows[0];
      const last = rows[rows.length - 1];
      const total = rows.reduce((sum, row) => sum + n(row?.amount), 0);

      return {
        startedAt: first?.time || null,
        endedAt: last?.time || null,
        durationSeconds: Math.max(0, n(last?.timestamp) - n(first?.timestamp)),
        transfers: rows.length,
        uniqueRecipients: new Set(rows.map((row) => row?.to).filter(Boolean)).size,
        totalWPOND: round(total),
        avgTransfer: rows.length ? round(total / rows.length) : 0,
      };
    })
    .sort((a, b) => new Date(b.endedAt || 0).getTime() - new Date(a.endedAt || 0).getTime());
}

function buildDistributorBehavior(chain, ledger, now = new Date()) {
  const transfers = Array.isArray(chain?.recentExternalClaims)
    ? chain.recentExternalClaims
    : [];

  const recipients = Array.isArray(ledger?.recipients)
    ? ledger.recipients
    : Array.isArray(chain?.recipientLedger?.recipients)
      ? chain.recipientLedger.recipients
      : [];

  const nowMs = now.getTime();
  const oneHour = windowStats(transfers, 60, nowMs);
  const sixHours = windowStats(transfers, 360, nowMs);
  const twentyFourHours = windowStats(transfers, 1440, nowMs);
  const velocity = compareWindows(transfers, 60, nowMs);
  const bursts = detectBursts(transfers, 10);

  const amounts = transfers.map((row) => n(row?.amount)).filter((value) => value > 0);
  const medianTransfer = median(amounts);
  const largestTransfer = amounts.length ? Math.max(...amounts) : 0;

  const amountAnomalies = medianTransfer
    ? transfers
        .filter((row) => n(row?.amount) >= medianTransfer * 3)
        .map((row) => ({
          time: row?.time || null,
          wallet: row?.to || null,
          amount: round(row?.amount),
          multipleOfMedian: round(n(row?.amount) / medianTransfer, 2),
          signature: row?.signature || null,
        }))
        .slice(0, 10)
    : [];

  const newRecipients = recipients.filter((row) => n(row?.transferCount) <= 1).length;
  const repeatRecipients = recipients.filter(
    (row) => n(row?.transferCount) >= 2 && n(row?.transferCount) < 5
  ).length;
  const frequentRecipients = recipients.filter((row) => n(row?.transferCount) >= 5).length;

  const latestTransfer = [...transfers].sort(
    (a, b) => n(b?.timestamp) - n(a?.timestamp)
  )[0] || null;

  const lastTransferAgeMinutes = latestTransfer?.timestamp
    ? round((nowMs - n(latestTransfer.timestamp) * 1000) / 60_000, 1)
    : null;

  const activityState =
    oneHour.transfers >= 5 || bursts.some((burst) => burst.transfers >= 5)
      ? "SURGING"
      : bursts.some((burst) => burst.transfers >= 3)
        ? "BURSTING"
        : oneHour.transfers > 0
          ? "ACTIVE"
          : sixHours.transfers > 0
            ? "COOLING"
            : "QUIET";

  const fetchedExternalClaims = n(chain?.flowClassification?.externalClaims);
  const sampleLimited = fetchedExternalClaims > transfers.length;

  return {
    version: "1.0.0",
    generatedAt: now.toISOString(),
    distributor: chain?.entities?.claimDistributor || null,
    classification: "OBSERVED_DISTRIBUTOR_BEHAVIOR",
    activityState,
    lastTransferAgeMinutes,
    latestTransfer,
    windows: {
      "1h": oneHour,
      "6h": sixHours,
      "24h": twentyFourHours,
    },
    velocity1h: velocity,
    recipientMix: {
      totalRecipients: recipients.length,
      newRecipients,
      repeatRecipients,
      frequentRecipients,
      newRecipientsThisSweep: n(
        ledger?.newRecipientsThisSweep ?? chain?.recipientLedger?.newRecipientsThisSweep
      ),
      newTransfersThisSweep: n(
        ledger?.newTransfersThisSweep ?? chain?.recipientLedger?.newTransfersThisSweep
      ),
    },
    transferProfile: {
      sampleSize: amounts.length,
      medianTransfer: medianTransfer === null ? null : round(medianTransfer),
      largestTransfer: round(largestTransfer),
      amountAnomalyCount: amountAnomalies.length,
    },
    bursts: {
      maxGapMinutes: 10,
      count: bursts.length,
      latest: bursts[0] || null,
      recent: bursts.slice(0, 5),
    },
    anomalies: amountAnomalies,
    coverage: {
      horizonMinutes: n(chain?.dataCoverage?.distributor?.horizonMinutes) || 1440,
      coverageComplete: chain?.dataCoverage?.distributor?.coverageComplete === true,
      fetchedExternalClaims,
      analyzedTransferSample: transfers.length,
      sampleLimited,
      note: sampleLimited
        ? "Behavioral windows use the recent external-claim sample exposed by chain-intelligence.json; totals in the persistent recipient ledger remain authoritative for lifetime counts."
        : "Behavioral windows cover all external claims exposed by the current chain sample.",
    },
    methodology:
      "Behavioral intelligence is derived from observed direct wPOND transfers from the monitored distributor to recipients other than the reward wallet. These transfers are treated as external claim candidates, not automatically asserted to be rewards or claims.",
  };
}

module.exports = {
  buildDistributorBehavior,
};

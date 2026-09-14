"use strict";

const fs = require("fs-extra");

/**
 * Runtime data status:
 *
 * OK       -> file exists and contains valid JSON
 * MISSING  -> file does not exist
 * INVALID  -> file exists but cannot be parsed/read
 */
const DATA_STATUS = Object.freeze({
  OK: "OK",
  MISSING: "MISSING",
  INVALID: "INVALID",
});

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function n(value, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;

  return (
    Math.round(
      n(value) * factor
    ) / factor
  );
}

function average(values) {
  const clean = arr(values)
    .map((value) => n(value));

  if (!clean.length) {
    return 0;
  }

  return (
    clean.reduce(
      (sum, value) => sum + value,
      0
    ) / clean.length
  );
}

function uniq(values) {
  return [
    ...new Set(
      arr(values).filter(Boolean)
    ),
  ];
}

/**
 * Never silently converts a broken JSON file into valid empty data.
 *
 * Consumers can explicitly decide what to do with:
 *
 * OK
 * MISSING
 * INVALID
 */
async function readJsonState(file) {
  const exists = await fs.pathExists(file);

  if (!exists) {
    return {
      status: DATA_STATUS.MISSING,
      file,
      data: null,
      error: null,
    };
  }

  try {
    const data = await fs.readJson(file);

    return {
      status: DATA_STATUS.OK,
      file,
      data,
      error: null,
    };
  } catch (error) {
    return {
      status: DATA_STATUS.INVALID,
      file,
      data: null,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    };
  }
}

/**
 * Use when missing data is acceptable,
 * but corrupt data is NOT.
 */
async function readJsonOptional(
  file,
  fallback = null
) {
  const result =
    await readJsonState(file);

  if (
    result.status ===
    DATA_STATUS.INVALID
  ) {
    throw new Error(
      `Invalid runtime JSON: ${file}: ${result.error}`
    );
  }

  if (
    result.status ===
    DATA_STATUS.MISSING
  ) {
    return fallback;
  }

  return result.data;
}

/**
 * Use for required pipeline inputs.
 *
 * Both missing and invalid JSON fail loudly.
 */
async function readJsonRequired(file) {
  const result =
    await readJsonState(file);

  if (
    result.status !==
    DATA_STATUS.OK
  ) {
    throw new Error(
      `Required runtime JSON unavailable: ${file} (${result.status})${
        result.error
          ? `: ${result.error}`
          : ""
      }`
    );
  }

  return result.data;
}

module.exports = {
  DATA_STATUS,
  arr,
  n,
  round,
  average,
  uniq,
  readJsonState,
  readJsonOptional,
  readJsonRequired,
};
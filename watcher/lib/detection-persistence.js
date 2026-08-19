const fs = require("fs-extra");
const path = require("path");

function buildDetectionPersistence({
  readJsonArraySafe,
  maxHistory,
  triggerPriorities,
}) {
  if (typeof readJsonArraySafe !== "function") {
    throw new TypeError(
      "readJsonArraySafe must be a function"
    );
  }

  if (
    !Number.isInteger(maxHistory) ||
    maxHistory <= 0
  ) {
    throw new TypeError(
      "maxHistory must be a positive integer"
    );
  }

  if (
    !triggerPriorities ||
    typeof triggerPriorities.has !== "function"
  ) {
    throw new TypeError(
      "triggerPriorities must provide has()"
    );
  }

  function dedupeById(items) {
    return items.filter(
      (item, index, arr) => {
        if (!item || !item.id) {
          return false;
        }

        return (
          arr.findIndex(
            (x) =>
              x &&
              x.id === item.id
          ) === index
        );
      }
    );
  }

  async function writeJsonAtomic(
    filePath,
    data,
    spaces = 2
  ) {
    const dir = path.dirname(filePath);

    const tmpPath = path.join(
      dir,
      `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
    );

    await fs.ensureDir(dir);

    await fs.writeJson(
      tmpPath,
      data,
      { spaces }
    );

    await fs.move(
      tmpPath,
      filePath,
      { overwrite: true }
    );
  }

  async function persistDetectionOutputs({
    publicDir,
    result,
  }) {
    const latestPath =
      path.join(
        publicDir,
        "latest.json"
      );

    const historyPath =
      path.join(
        publicDir,
        "history.json"
      );

    const lastTriggeredPath =
      path.join(
        publicDir,
        "last-triggered.json"
      );

    await fs.ensureDir(publicDir);

    const existingHistory =
      await readJsonArraySafe(
        historyPath
      );

    const nextHistory =
      dedupeById([
        result,
        ...existingHistory,
      ]).slice(0, maxHistory);

    await writeJsonAtomic(
      latestPath,
      result
    );

    await writeJsonAtomic(
      historyPath,
      nextHistory
    );

    if (
      triggerPriorities.has(
        result.priority
      )
    ) {
      await writeJsonAtomic(
        lastTriggeredPath,
        result
      );
    }
  }

  return {
    dedupeById,
    writeJsonAtomic,
    persistDetectionOutputs,
  };
}

module.exports = {
  buildDetectionPersistence,
};

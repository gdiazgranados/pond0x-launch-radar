"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const fs = require("fs-extra");
const os = require("node:os");
const path = require("node:path");

const {
  buildDetectionPersistence,
} = require("../lib/detection-persistence");

async function readJsonArraySafe(filePath) {
  if (!(await fs.pathExists(filePath))) {
    return [];
  }

  try {
    const data =
      await fs.readJson(filePath);

    return Array.isArray(data)
      ? data
      : [];
  } catch {
    return [];
  }
}

async function createTempDir() {
  return fs.mkdtemp(
    path.join(
      os.tmpdir(),
      "pond0x-radar-test-"
    )
  );
}

function createPersistence({
  maxHistory = 3,
  triggerPriorities =
    new Set([
      "HIGH",
      "VERY HIGH",
      "CRITICAL",
    ]),
} = {}) {
  return buildDetectionPersistence({
    readJsonArraySafe,
    maxHistory,
    triggerPriorities,
  });
}

test(
  "detection persistence: dedupeById keeps first unique valid entries",
  () => {
    const {
      dedupeById,
    } = createPersistence();

    const actual =
      dedupeById([
        { id: "a", value: 1 },
        { id: "b", value: 2 },
        { id: "a", value: 3 },
        null,
        {},
        { id: "c", value: 4 },
      ]);

    assert.deepStrictEqual(
      actual,
      [
        { id: "a", value: 1 },
        { id: "b", value: 2 },
        { id: "c", value: 4 },
      ]
    );
  }
);

test(
  "detection persistence: writes latest and bounded history",
  async () => {
    const publicDir =
      await createTempDir();

    try {
      const {
        persistDetectionOutputs,
      } = createPersistence({
        maxHistory: 3,
      });

      const historyPath =
        path.join(
          publicDir,
          "history.json"
        );

      await fs.writeJson(
        historyPath,
        [
          { id: "old-1", priority: "LOW" },
          { id: "old-2", priority: "LOW" },
          { id: "old-3", priority: "LOW" },
        ],
        { spaces: 2 }
      );

      const result = {
        id: "new-1",
        priority: "LOW",
        score: 10,
      };

      await persistDetectionOutputs({
        publicDir,
        result,
      });

      const latest =
        await fs.readJson(
          path.join(
            publicDir,
            "latest.json"
          )
        );

      const history =
        await fs.readJson(
          historyPath
        );

      assert.deepStrictEqual(
        latest,
        result
      );

      assert.equal(
        history.length,
        3
      );

      assert.deepStrictEqual(
        history.map(
          (item) => item.id
        ),
        [
          "new-1",
          "old-1",
          "old-2",
        ]
      );
    } finally {
      await fs.remove(publicDir);
    }
  }
);

test(
  "detection persistence: duplicate result id is not repeated in history",
  async () => {
    const publicDir =
      await createTempDir();

    try {
      const {
        persistDetectionOutputs,
      } = createPersistence();

      await fs.writeJson(
        path.join(
          publicDir,
          "history.json"
        ),
        [
          {
            id: "same-1",
            priority: "LOW",
            score: 1,
          },
          {
            id: "other-1",
            priority: "LOW",
            score: 2,
          },
        ],
        { spaces: 2 }
      );

      const result = {
        id: "same-1",
        priority: "LOW",
        score: 99,
      };

      await persistDetectionOutputs({
        publicDir,
        result,
      });

      const history =
        await fs.readJson(
          path.join(
            publicDir,
            "history.json"
          )
        );

      assert.equal(
        history.filter(
          (item) =>
            item.id === "same-1"
        ).length,
        1
      );

      assert.equal(
        history[0].score,
        99
      );
    } finally {
      await fs.remove(publicDir);
    }
  }
);

test(
  "detection persistence: low priority does not update last-triggered",
  async () => {
    const publicDir =
      await createTempDir();

    try {
      const {
        persistDetectionOutputs,
      } = createPersistence();

      const lastTriggeredPath =
        path.join(
          publicDir,
          "last-triggered.json"
        );

      const previous = {
        id: "previous-trigger",
        priority: "HIGH",
      };

      await fs.writeJson(
        lastTriggeredPath,
        previous,
        { spaces: 2 }
      );

      await persistDetectionOutputs({
        publicDir,
        result: {
          id: "low-1",
          priority: "LOW",
        },
      });

      const after =
        await fs.readJson(
          lastTriggeredPath
        );

      assert.deepStrictEqual(
        after,
        previous
      );
    } finally {
      await fs.remove(publicDir);
    }
  }
);

test(
  "detection persistence: trigger priority updates last-triggered",
  async () => {
    const publicDir =
      await createTempDir();

    try {
      const {
        persistDetectionOutputs,
      } = createPersistence();

      const result = {
        id: "critical-1",
        priority: "CRITICAL",
        score: 100,
      };

      await persistDetectionOutputs({
        publicDir,
        result,
      });

      const lastTriggered =
        await fs.readJson(
          path.join(
            publicDir,
            "last-triggered.json"
          )
        );

      assert.deepStrictEqual(
        lastTriggered,
        result
      );
    } finally {
      await fs.remove(publicDir);
    }
  }
);

test(
  "detection persistence: writeJsonAtomic replaces target cleanly",
  async () => {
    const publicDir =
      await createTempDir();

    try {
      const {
        writeJsonAtomic,
      } = createPersistence();

      const filePath =
        path.join(
          publicDir,
          "atomic.json"
        );

      await writeJsonAtomic(
        filePath,
        {
          version: 1,
        }
      );

      await writeJsonAtomic(
        filePath,
        {
          version: 2,
        }
      );

      const actual =
        await fs.readJson(
          filePath
        );

      assert.deepStrictEqual(
        actual,
        {
          version: 2,
        }
      );

      const tempFiles =
        (
          await fs.readdir(
            publicDir
          )
        ).filter(
          (name) =>
            name.includes(".tmp")
        );

      assert.deepStrictEqual(
        tempFiles,
        []
      );
    } finally {
      await fs.remove(publicDir);
    }
  }
);

test(
  "detection persistence: invalid dependencies throw",
  () => {
    assert.throws(
      () =>
        buildDetectionPersistence({
          readJsonArraySafe: null,
          maxHistory: 3,
          triggerPriorities:
            new Set(["HIGH"]),
        }),
      {
        name: "TypeError",
        message:
          "readJsonArraySafe must be a function",
      }
    );

    assert.throws(
      () =>
        buildDetectionPersistence({
          readJsonArraySafe,
          maxHistory: 0,
          triggerPriorities:
            new Set(["HIGH"]),
        }),
      {
        name: "TypeError",
        message:
          "maxHistory must be a positive integer",
      }
    );

    assert.throws(
      () =>
        buildDetectionPersistence({
          readJsonArraySafe,
          maxHistory: 3,
          triggerPriorities: null,
        }),
      {
        name: "TypeError",
        message:
          "triggerPriorities must provide has()",
      }
    );
  }
);

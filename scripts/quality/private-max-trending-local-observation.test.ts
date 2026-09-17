import test from "node:test"
import assert from "node:assert/strict"
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
} from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { PrivateFileLedgerStore } from "../../src/private-alpha/file-ledger-store"
import {
  coordinateMaxTrendingObservation,
} from "../../src/private-alpha/max-trending-observation-coordinator"
import type {
  MaxTrendingSnapshot,
} from "../../src/private-alpha/max-trending-client"

function emptySnapshot(observedAt: string): MaxTrendingSnapshot {
  return {
    schemaVersion: 1,
    observedAt,
    status: "EMPTY",
    query: { q: "", verified: false, network: "all" },
    tokenCount: 4,
    trending: [],
    watchOnly: true,
    approvalGranted: false,
    transactionRequested: false,
    source: "PONDOX_MAX_SEARCH",
  }
}

test("suppresses consecutive routine writes in the private atomic store", async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "pond0x-max-trending-")
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const ledgerPath = join(directory, "max-trending-ledger.json")
  const store = new PrivateFileLedgerStore(ledgerPath)

  const first = await coordinateMaxTrendingObservation({
    store,
    observe: async () => emptySnapshot("2026-09-16T18:32:44.666Z"),
  })
  const second = await coordinateMaxTrendingObservation({
    store,
    observe: async () => emptySnapshot("2026-09-16T18:33:44.666Z"),
  })

  assert.equal(first.status, "BASELINE")
  assert.equal(first.event, null)
  assert.equal(second.status, "EMPTY")
  assert.equal(second.persisted, false)
  assert.equal(second.ledgerRevision, 1)

  const ledger = JSON.parse(await readFile(ledgerPath, "utf8"))
  assert.equal(ledger.revision, 1)
  assert.equal(ledger.snapshots.length, 1)
  assert.equal(
    ledger.updatedAt,
    "2026-09-16T18:32:44.666Z"
  )
  assert.deepEqual(await readdir(directory), [
    "max-trending-ledger.json",
  ])
})

test("preserves the prior ledger when the next observation fails", async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "pond0x-max-trending-")
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const ledgerPath = join(directory, "max-trending-ledger.json")
  const store = new PrivateFileLedgerStore(ledgerPath)

  await coordinateMaxTrendingObservation({
    store,
    observe: async () => emptySnapshot("2026-09-16T18:32:44.666Z"),
  })
  const before = await readFile(ledgerPath, "utf8")

  await assert.rejects(
    () => coordinateMaxTrendingObservation({
      store,
      observe: async () => {
        throw new Error("Pond0x MAX returned HTTP 503")
      },
    }),
    /HTTP 503/
  )

  assert.equal(await readFile(ledgerPath, "utf8"), before)
  assert.deepEqual(await readdir(directory), [
    "max-trending-ledger.json",
  ])
})

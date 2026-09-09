import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { PrivateFileLedgerStore } from "../../src/private-alpha/file-ledger-store"

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "pond0x-shadow-"))
  return {
    directory,
    store: new PrivateFileLedgerStore(join(directory, "ledger.json")),
  }
}

test("creates a private ledger only when revision advances", async (t) => {
  const { directory, store } = await fixture()
  t.after(() => rm(directory, { recursive: true, force: true }))

  assert.equal(await store.read(), null)
  assert.equal(
    await store.compareAndSet(0, JSON.stringify({ revision: 1 })),
    true
  )
  assert.deepEqual(
    JSON.parse(await readFile(join(directory, "ledger.json"), "utf8")),
    { revision: 1 }
  )
})

test("rejects a stale compare-and-set without overwriting", async (t) => {
  const { directory, store } = await fixture()
  t.after(() => rm(directory, { recursive: true, force: true }))

  await store.compareAndSet(0, JSON.stringify({ revision: 1 }))
  assert.equal(
    await store.compareAndSet(0, JSON.stringify({ revision: 1 })),
    false
  )
  assert.equal(JSON.parse((await store.read())!).revision, 1)
})

test("rejects malformed or skipped ledger revisions", async (t) => {
  const { directory, store } = await fixture()
  t.after(() => rm(directory, { recursive: true, force: true }))

  await assert.rejects(
    store.compareAndSet(0, "{bad"),
    /invalid private ledger JSON/
  )
  await assert.rejects(
    store.compareAndSet(0, JSON.stringify({ revision: 2 })),
    /must advance by one/
  )
})

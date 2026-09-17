import assert from "node:assert/strict"
import { access, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import {
  acquireMaxTrendingMonitorLock,
} from "../../src/private-alpha/max-trending-monitor-lock"

test("prevents a second live MAX monitor instance", async t => {
  const directory = await mkdtemp(join(tmpdir(), "pond0x-max-lock-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const path = join(directory, "monitor.lock")
  const first = await acquireMaxTrendingMonitorLock({
    path,
    pid: 101,
    now: () => new Date("2026-09-17T00:00:00.000Z"),
  })

  await assert.rejects(
    acquireMaxTrendingMonitorLock({
      path,
      pid: 102,
      isProcessAlive: pid => pid === 101,
    }),
    /already runs as pid 101/
  )

  await first.release()
  await assert.rejects(access(path), { code: "ENOENT" })
})

test("recovers a stale MAX monitor lock", async t => {
  const directory = await mkdtemp(join(tmpdir(), "pond0x-max-lock-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const path = join(directory, "monitor.lock")
  await writeFile(path, JSON.stringify({
    pid: 201,
    acquiredAt: "2026-09-16T00:00:00.000Z",
  }))

  const lock = await acquireMaxTrendingMonitorLock({
    path,
    pid: 202,
    isProcessAlive: () => false,
  })

  assert.equal(lock.path, path)
  await lock.release()
})

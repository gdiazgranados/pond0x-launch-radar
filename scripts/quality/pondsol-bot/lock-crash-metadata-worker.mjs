import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { hostname } from "node:os"
import { join } from "node:path"

const [filePath, phase] = process.argv.slice(2)
if (!filePath || !["before-metadata", "after-metadata"].includes(phase)) {
  throw new Error("INVALID_CRASH_WORKER_ARGUMENTS")
}
const lockPath = `${filePath}.lock`
await mkdir(lockPath)
if (phase === "after-metadata") {
  await writeFile(join(lockPath, "owner.json"), JSON.stringify({
    version: 1,
    pid: process.pid,
    hostname: hostname(),
    lockId: randomUUID(),
    acquiredAtUtc: new Date().toISOString(),
  }), { flag: "wx" })
}
console.log(`CRASH_PHASE:${phase}`)
process.exit(99)

import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

type RevisionedLedger = {
  revision: number
}

function ledgerRevision(serialized: string | null) {
  if (serialized === null) return 0

  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error("invalid private ledger JSON")
  }

  if (
    typeof value !== "object" ||
    value === null ||
    !Number.isInteger((value as RevisionedLedger).revision) ||
    (value as RevisionedLedger).revision < 0
  ) {
    throw new Error("invalid private ledger revision")
  }

  return (value as RevisionedLedger).revision
}

export class PrivateFileLedgerStore {
  constructor(private readonly filePath: string) {}

  async read() {
    try {
      return await readFile(this.filePath, "utf8")
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return null
      }
      throw error
    }
  }

  async compareAndSet(
    expectedRevision: number,
    serializedLedger: string
  ) {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new Error("expectedRevision must be a non-negative integer")
    }

    const nextRevision = ledgerRevision(serializedLedger)
    if (nextRevision !== expectedRevision + 1) {
      throw new Error("private ledger revision must advance by one")
    }

    await mkdir(dirname(this.filePath), { recursive: true })
    const lockPath = `${this.filePath}.lock`
    let lock: Awaited<ReturnType<typeof open>> | null = null

    try {
      lock = await open(lockPath, "wx")
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        return false
      }
      throw error
    }

    const temporaryPath =
      `${this.filePath}.${process.pid}.${Date.now()}.tmp`

    try {
      const current = await this.read()
      if (ledgerRevision(current) !== expectedRevision) return false

      await writeFile(temporaryPath, serializedLedger, {
        encoding: "utf8",
        mode: 0o600,
      })
      await rename(temporaryPath, this.filePath)
      return true
    } finally {
      await lock.close()
      await unlink(lockPath).catch(() => undefined)
      await unlink(temporaryPath).catch(() => undefined)
    }
  }
}

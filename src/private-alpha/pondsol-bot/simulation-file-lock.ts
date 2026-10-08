
import { randomUUID } from "node:crypto"
import {
  mkdir,
  readFile,
  rmdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises"
import { hostname } from "node:os"

export type SimulationLockOwner = {
  version: 1
  pid: number
  hostname: string
  lockId: string
  acquiredAtUtc: string
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  )
}

export async function inspectSimulationLock(
  filePath: string
): Promise<SimulationLockOwner | null> {
  const lockPath = `${filePath}.lock`

  let contents: string

  try {
    contents = await readFile(
      `${lockPath}/owner.json`,
      "utf8"
    )
  } catch (error) {
    if (hasCode(error, "ENOENT")) {
      return null
    }

    throw error
  }

  const owner: unknown = JSON.parse(contents)

  if (
    typeof owner !== "object" ||
    owner === null ||
    !("version" in owner) ||
    owner.version !== 1 ||
    !("pid" in owner) ||
    !Number.isSafeInteger(owner.pid) ||
    !("hostname" in owner) ||
    typeof owner.hostname !== "string" ||
    !("lockId" in owner) ||
    typeof owner.lockId !== "string" ||
    !("acquiredAtUtc" in owner) ||
    typeof owner.acquiredAtUtc !== "string"
  ) {
    throw new Error("SIMULATION_LOCK_METADATA_INVALID")
  }

  return owner as SimulationLockOwner
}

export async function withSimulationFileLock<T>(
  filePath: string,
  operation: () => Promise<T>
): Promise<T> {
  const lockPath = `${filePath}.lock`
  const ownerPath = `${lockPath}/owner.json`

  try {
    await mkdir(lockPath)
  } catch (error) {
    if (hasCode(error, "EEXIST")) {
      throw new Error("SIMULATION_STATE_LOCKED")
    }

    throw error
  }

  const owner: SimulationLockOwner = {
    version: 1,
    pid: process.pid,
    hostname: hostname(),
    lockId: randomUUID(),
    acquiredAtUtc: new Date().toISOString(),
  }


let operationError: unknown
let operationFailed = false
let result!: T

try {
  await writeFile(
    ownerPath,
    JSON.stringify(owner, null, 2),
    { flag: "wx" }
  )

  result = await operation()
} catch (error) {
  operationError = error
  operationFailed = true
}

try {
  const currentOwner =
    await inspectSimulationLock(filePath)

  if (currentOwner?.lockId !== owner.lockId) {
    throw new Error("SIMULATION_LOCK_OWNERSHIP_LOST")
  }

  await unlink(ownerPath)
  await rmdir(lockPath)
} catch (cleanupError) {
  if (operationFailed) {
    throw new AggregateError(
      [operationError, cleanupError],
      "SIMULATION_OPERATION_AND_CLEANUP_FAILED"
    )
  }

  throw cleanupError
}

if (operationFailed) {
  throw operationError
}

return result

}

export type SimulationLockStatus =
  | "UNLOCKED"
  | "ACTIVE"
  | "ORPHAN_CANDIDATE"
  | "UNKNOWN"

export async function diagnoseSimulationLock(
  filePath: string
): Promise<SimulationLockStatus> {
  const lockPath = `${filePath}.lock`

  try {
    await stat(lockPath)
  } catch (error) {
    if (hasCode(error, "ENOENT")) {
      return "UNLOCKED"
    }

    return "UNKNOWN"
  }

  let owner: SimulationLockOwner | null

  try {
    owner = await inspectSimulationLock(filePath)
  } catch {
    return "UNKNOWN"
  }

  if (!owner) {
    return "UNKNOWN"
  }

  if (owner.hostname !== hostname()) {
    return "UNKNOWN"
  }

  try {
    process.kill(owner.pid, 0)
    return "ACTIVE"
  } catch (error) {
    if (hasCode(error, "ESRCH")) {
      return "ORPHAN_CANDIDATE"
    }

    return "UNKNOWN"
  }
}

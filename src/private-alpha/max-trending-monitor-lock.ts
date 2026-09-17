import {
  mkdir,
  open,
  readFile,
  unlink,
  type FileHandle,
} from "node:fs/promises"
import { dirname } from "node:path"

type LockPayload = {
  pid: number
  acquiredAt: string
}

export type MaxTrendingMonitorLock = {
  path: string
  release(): Promise<void>
}

function errorCode(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  )
    ? error.code
    : null
}

function defaultProcessAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return errorCode(error) === "EPERM"
  }
}

async function readLock(path: string): Promise<LockPayload | null> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown
    if (
      value !== null &&
      typeof value === "object" &&
      "pid" in value &&
      Number.isInteger(value.pid) &&
      Number(value.pid) > 0 &&
      "acquiredAt" in value &&
      typeof value.acquiredAt === "string" &&
      Number.isFinite(Date.parse(value.acquiredAt))
    ) {
      return {
        pid: Number(value.pid),
        acquiredAt: value.acquiredAt,
      }
    }
  } catch {
    return null
  }
  return null
}

async function createLock(
  path: string,
  payload: LockPayload
): Promise<FileHandle> {
  const handle = await open(path, "wx", 0o600)
  try {
    await handle.writeFile(JSON.stringify(payload) + "\n", "utf8")
    return handle
  } catch (error) {
    await handle.close()
    await unlink(path).catch(() => undefined)
    throw error
  }
}

export async function acquireMaxTrendingMonitorLock(input: {
  path: string
  pid?: number
  now?: () => Date
  isProcessAlive?: (pid: number) => boolean
}): Promise<MaxTrendingMonitorLock> {
  const pid = input.pid ?? process.pid
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error("MAX trending monitor lock pid must be positive")
  }

  await mkdir(dirname(input.path), { recursive: true })
  const payload = {
    pid,
    acquiredAt: (input.now?.() ?? new Date()).toISOString(),
  }
  let handle: FileHandle | null = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      handle = await createLock(input.path, payload)
      break
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error
      const existing = await readLock(input.path)
      const alive = existing && (
        input.isProcessAlive ?? defaultProcessAlive
      )(existing.pid)
      if (alive || attempt === 1) {
        throw new Error(
          existing
            ? `MAX trending monitor already runs as pid ${existing.pid}`
            : "MAX trending monitor lock is unreadable"
        )
      }
      await unlink(input.path).catch(error => {
        if (errorCode(error) !== "ENOENT") throw error
      })
    }
  }

  if (!handle) throw new Error("could not acquire MAX trending monitor lock")
  let released = false
  return {
    path: input.path,
    async release() {
      if (released) return
      released = true
      await handle.close()
      await unlink(input.path).catch(error => {
        if (errorCode(error) !== "ENOENT") throw error
      })
    },
  }
}

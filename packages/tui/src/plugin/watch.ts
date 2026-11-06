import path from "path"
import { existsSync, watch } from "fs"
import { lstat, realpath, stat } from "fs/promises"












export function createSourceWatcher(onChange: () => void) {
  const watchers = new Map<string, ReturnType<typeof watch>>()
  const watched = new Map<string, Set<string> | null>()
  const missing = new Set<string>()
  const arming = new Map<string, Promise<void>>()
  let disposed = false
  const notify = () => {
    if (!disposed) onChange()
  }
  const forget = (dir: string) => {
    watchers.get(dir)?.close()
    watchers.delete(dir)
    watched.delete(dir)
  }
  const arm = (target: string, retry: boolean) => {
    const active = arming.get(target)
    if (active) return active
    const result = stat(target)
      .then((info) => {
        if (disposed) return
        const appeared = missing.delete(target)
        const dir = info.isDirectory() ? target : path.dirname(target)
        
        const name = info.isDirectory() ? null : path.basename(target)
        const existing = watched.get(dir)
        if (existing !== undefined) {
          if (name === null) watched.set(dir, null)
          else existing?.add(name)
          if (appeared) notify()
          return
        }
        const watcher = watch(dir, (_event, filename) => {
          
          
          
          if (!existsSync(dir)) {
            forget(dir)
            notify()
            return
          }
          
          const accept = watched.get(dir)
          if (filename && accept && !accept.has(filename.toString())) return
          notify()
        })
        watched.set(dir, name === null ? null : new Set([name]))
        
        
        watcher.on("error", () => {
          forget(dir)
          notify()
        })
        watchers.set(dir, watcher)
        if (appeared) notify()
      })
      .catch((error: unknown) => {
        if (!disposed && retry && isMissing(error)) missing.add(target)
      })
      .finally(() => arming.delete(target))
    arming.set(target, result)
    return result
  }
  const add = async (target: string, retry: boolean) => {
    await arm(target, retry)
    
    await lstat(target)
      .then((info) => {
        if (!info.isSymbolicLink()) return
        return realpath(target).then((target) => arm(target, retry))
      })
      .catch(() => undefined)
  }
  const dispose = () => {
    disposed = true
    clearInterval(poll)
    for (const watcher of watchers.values()) watcher.close()
    watchers.clear()
    watched.clear()
    missing.clear()
  }
  const poll = setInterval(() => missing.forEach((target) => arm(target, true)), 500)
  poll.unref()
  return {
    add: (target: string) => add(target, false),
    wait: (target: string) => add(target, true),
    dispose,
  }
}

function isMissing(error: unknown) {
  if (!error || typeof error !== "object") return false
  const code = "code" in error ? error.code : undefined
  return code === "ENOENT" || code === "ENOTDIR"
}

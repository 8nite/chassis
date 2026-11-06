type Entry = { method: string; url: string; at: number; slow: boolean }




export const requestQueueLimit = 4



export const requestQueueSlowLimit = 2

export const slowRequestPaths = ["/api/vcs", "/api/worktree"]



export const requestStallMs = 2_000




export const requestHeadersTimeoutMs = 60_000




export const setupRequestHeadersTimeoutMs = 10 * 60_000

function isSlowRequest(pathname: string) {
  return slowRequestPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

function isSetupRequest(method: string, pathname: string) {
  return method === "POST" && pathname === "/api/worktree"
}

export function createRequestQueue(input: {
  fetch: typeof globalThis.fetch
  limit?: number
  slowLimit?: number
  stallMs?: number
  headersTimeoutMs?: number
  setupHeadersTimeoutMs?: number
  log?: (message: string, data: Record<string, unknown>) => void
  now?: () => number
}) {
  const limit = input.limit ?? requestQueueLimit
  const slowLimit = input.slowLimit ?? requestQueueSlowLimit
  const stallMs = input.stallMs ?? requestStallMs
  const headersTimeoutMs = input.headersTimeoutMs ?? requestHeadersTimeoutMs
  const setupHeadersTimeoutMs = input.setupHeadersTimeoutMs ?? setupRequestHeadersTimeoutMs
  
  const base = input.fetch
  const now = input.now ?? Date.now
  const log = input.log ?? ((message, data) => console.warn(`[server-request-queue] ${message}`, data))
  const inflight = new Set<Entry>()
  const waiting: Array<{ entry: Entry; start: () => void }> = []
  let warned = -Infinity
  let watcher: ReturnType<typeof setTimeout> | undefined

  const describe = (entry: Entry) => ({ method: entry.method, url: entry.url, ms: now() - entry.at })

  
  const watch = () => {
    watcher = undefined
    const oldest = waiting[0]?.entry

    if (!oldest) return

    if (now() - oldest.at >= stallMs && now() - warned >= 10_000) {
      warned = now()
      log("server thrashing detected", {
        limit,
        inflight: [...inflight].map(describe),
        queued: waiting.map((item) => describe(item.entry)),
      })
    }

    watcher = setTimeout(watch, stallMs)
  }

  const canStart = (entry: Entry) => {
    if (inflight.size >= limit) return false

    if (!entry.slow) return true

    return [...inflight].filter((item) => item.slow).length < slowLimit
  }

  
  const release = (entry: Entry) => {
    inflight.delete(entry)
    const index = waiting.findIndex((item) => canStart(item.entry))

    if (index === -1) return
    waiting.splice(index, 1)[0]?.start()
  }

  const acquire = (entry: Entry) => {
    
    
    if (canStart(entry)) {
      inflight.add(entry)

      return
    }

    return new Promise<void>((resolve) => {
      const start = () => {
        entry.at = now()
        inflight.add(entry)
        resolve()
      }

      waiting.push({ entry, start })
      watcher ??= setTimeout(watch, stallMs)
    })
  }

  const fetch: typeof globalThis.fetch = Object.assign(
    async (resource: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(resource, init)
      const pathname = new URL(request.url).pathname

      
      if (pathname === "/api/event") return base(request)
      const entry = { method: request.method, url: request.url, at: now(), slow: isSlowRequest(pathname) }
      const queued = acquire(entry)

      if (queued) await queued

      if (request.signal.aborted) {
        release(entry)
        throw request.signal.reason ?? new DOMException("The operation was aborted.", "AbortError")
      }

      const controller = new AbortController()
      request.signal.addEventListener("abort", () => controller.abort(request.signal.reason), { once: true })

      const timer = setTimeout(
        () => controller.abort(new DOMException("Timed out waiting for the server to respond", "TimeoutError")),
        isSetupRequest(request.method, pathname) ? setupHeadersTimeoutMs : headersTimeoutMs,
      )

      return base(new Request(request, { signal: controller.signal })).finally(() => {
        clearTimeout(timer)
        release(entry)
      })
    },
    
    { preconnect: () => {} },
  )

  return {
    fetch,
    inflight: () => inflight.size,
    queued: () => waiting.length,
  }
}

import type { AsyncStorage } from "@solid-primitives/storage"



export type NamespaceDriver = {
  items(name: string): Promise<{ items: Record<string, string>; revision: number }>
  update(name: string, insert: Record<string, string>, remove: string[]): Promise<number>
  clear(name: string): Promise<void>
}

export type NamespaceStorage = AsyncStorage & {
  
  flush(): Promise<void>
  
  accept(insert: Record<string, string>, remove: string[], revision: number): void
}

export const namespaceFlushDelay = 100











export function createNamespaceStorage(
  driver: NamespaceDriver,
  name: string,
  options: { delay?: number } = {},
): NamespaceStorage {
  const delay = options.delay ?? namespaceFlushDelay
  const cache = new Map<string, string>()
  const local = new Map<string, { seq: number; value: string | null }>()
  const dirty = new Set<string>()
  const inflight = new Set<Promise<void>>()
  
  const applied = new Map<string, number>()
  let floor = -1
  
  const deferred = new Map<string, { revision: number; value: string | null }>()
  let seq = 0
  let loading: Promise<void> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  const place = (key: string, value: string | null, revision: number) => {
    if (value === null) cache.delete(key)
    else cache.set(key, value)
    applied.set(key, revision)
  }

  
  
  const load = () =>
    (loading ??= driver.items(name).then((loaded) => {
      floor = loaded.revision
      const stale = (key: string) => !local.has(key) && (applied.get(key) ?? -1) <= loaded.revision

      for (const key of [...cache.keys()]) {
        if (!(key in loaded.items) && stale(key)) place(key, null, loaded.revision)
      }

      for (const [key, value] of Object.entries(loaded.items)) {
        if (stale(key)) place(key, value, loaded.revision)
      }
    }))

  const write = (key: string, value: string | null) => {
    if (value === null) cache.delete(key)
    else cache.set(key, value)
    local.set(key, { seq: ++seq, value })
    dirty.add(key)
    timer ??= setTimeout(() => void flush(), delay)
  }

  
  
  const acknowledge = (key: string, revision: number) => {
    local.delete(key)
    const later = deferred.get(key)
    deferred.delete(key)

    if (later && later.revision > revision) return place(key, later.value, later.revision)
    applied.set(key, revision)
  }

  const flush = () => {
    clearTimeout(timer)
    timer = undefined

    if (dirty.size > 0) {
      const batch = [...dirty].map((key) => ({ key, ...local.get(key)! }))
      dirty.clear()
      const insert = Object.fromEntries(batch.filter((entry) => entry.value !== null).map((e) => [e.key, e.value!]))
      const remove = batch.filter((entry) => entry.value === null).map((entry) => entry.key)
      const current = (entry: { key: string; seq: number }) => local.get(entry.key)?.seq === entry.seq

      const request = driver
        .update(name, insert, remove)
        .then((revision) => batch.filter(current).forEach((entry) => acknowledge(entry.key, revision)))
        .catch((error: unknown) => {
          
          batch.filter(current).forEach((entry) => dirty.add(entry.key))
          console.error(`[persistence] flush failed for ${name}`, error)
        })
        .finally(() => inflight.delete(request))

      inflight.add(request)
    }

    return Promise.all(inflight).then(() => undefined)
  }

  const storage: NamespaceStorage = {
    getItem: async (key) => {
      await load()

      return cache.get(key) ?? null
    },
    setItem: async (key, value) => write(key, value),
    removeItem: async (key) => write(key, null),
    clear: async () => {
      clearTimeout(timer)
      timer = undefined
      cache.clear()
      local.clear()
      dirty.clear()
      applied.clear()
      deferred.clear()
      loading = Promise.resolve()
      await driver.clear(name)
    },
    key: async (index: number) => {
      await load()

      return [...cache.keys()][index]
    },
    getLength: async () => {
      await load()

      return cache.size
    },
    get length() {
      return storage.getLength()
    },
    flush,
    accept(insert, remove, revision) {
      
      if (revision <= floor) return

      const changes = [
        ...Object.entries(insert).map(([key, value]) => [key, value] as const),
        ...remove.map((key) => [key, null] as const),
      ]

      for (const [key, value] of changes) {
        if (local.has(key)) {
          const held = deferred.get(key)

          if (!held || revision > held.revision) deferred.set(key, { revision, value })
          continue
        }

        if (revision <= (applied.get(key) ?? floor)) continue
        place(key, value, revision)
      }
    },
  }

  return storage
}

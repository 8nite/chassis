import type { AsyncStorage, PersistenceSyncAPI, SyncStorage } from "@solid-primitives/storage"
import { getOwner, onCleanup, untrack } from "solid-js"
import { reconcile, type SetStoreFunction, type Store } from "solid-js/store"

export const persistSaveDelay = 100

const pending = new Set<() => void>()


export function flushPersisted() {
  for (const save of [...pending]) save()
}



if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPersisted()
  })
  window.addEventListener("pagehide", flushPersisted)
}




export function persistStore<T extends object>(input: {
  store: Store<T>
  setStore: SetStoreFunction<T>
  name: string
  storage: SyncStorage | AsyncStorage
  serialize: (value: T) => string
  deserialize: (raw: string) => T
  sync?: PersistenceSyncAPI
  delay?: number
  
  write?: (value: T, serialized: string) => void
}) {
  const delay = input.delay ?? persistSaveDelay
  let dirty = false
  let touched = false
  let last: string | undefined
  
  
  let remote: string | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  const save = () => {
    clearTimeout(timer)
    timer = undefined
    pending.delete(save)

    if (!dirty) return
    dirty = false
    const held = remote
    remote = undefined
    const next = untrack(() => input.serialize(input.store))

    if (next === last) {
      if (held !== undefined && held !== last) hydrate(held)

      return
    }

    last = next
    input.sync?.[1](input.name, next)

    if (input.write) return input.write(input.store, next)
    void input.storage.setItem(input.name, next)
  }

  
  const apply = input.setStore as unknown as (...values: unknown[]) => void

  const setStore = ((...values: unknown[]) => {
    apply(...values)
    dirty = true
    touched = true
    pending.add(save)
    timer ??= setTimeout(save, delay)
  }) as unknown as SetStoreFunction<T>

  const hydrate = (raw: string) => {
    last = raw
    input.setStore(reconcile(input.deserialize(raw)))
  }

  const init = input.storage.getItem(input.name)

  
  if (init instanceof Promise) void init.then((raw) => raw && !touched && hydrate(raw))
  else if (init) hydrate(init)

  input.sync?.[0]((data) => {
    if (data.key !== input.name || (data.url ?? location.href) !== location.href) return

    if (!data.newValue) return

    
    
    
    
    if (dirty) {
      remote = data.newValue

      return
    }

    if (data.newValue === last) return
    hydrate(data.newValue)
  })

  if (getOwner()) onCleanup(save)

  return { setStore, init, flush: save }
}

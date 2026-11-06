import {
  batch,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  on,
  untrack,
  type Accessor,
  type Owner,
} from "solid-js"
import { produce, reconcile, type SetStoreFunction } from "solid-js/store"
import { Predicate } from "effect"
import type { Mutable, Persisted, SessionRef, StoreFrom } from "@chassis/gui-extensions/sdk"
import { Persist, type persisted } from "@/runtime/persistence/storage"
import type { SessionStateKey } from "@/runtime/server/scope"


type CopyFrom = NonNullable<Exclude<Parameters<typeof persisted>[0], string>["copyFrom"]>[number]

const loads = new WeakMap<object, Promise<void>>()


export function storeName(extension: string, key: string) {
  return `extension.${extension}.${key}`
}


export function globalStoreTarget(extension: string, key: string, from: StoreFrom | readonly StoreFrom[] | undefined) {
  return { ...Persist.global(storeName(extension, key)), copyFrom: storeImports(from) }
}


export function storeImports(
  from: StoreFrom | readonly StoreFrom[] | undefined,
  session?: SessionStateKey,
): CopyFrom[] {
  return [from ?? []].flat().map((item) => (session && sessionCopy(item, session)) || copySpec(item))
}

function copySpec(from: StoreFrom): CopyFrom {
  return Predicate.isString(from) ? { key: from } : from
}

function sessionCopy(from: StoreFrom, session: SessionStateKey): CopyFrom | undefined {
  if (Predicate.isString(from) || !from.sessions) return

  const field = from.sessions

  return {
    key: from.key,
    storage: Persist.global(from.key).storage,
    pick: (value) => {
      const sessions = Predicate.isObject(value) ? value[field] : undefined

      return from.pick(Predicate.isObject(sessions) ? sessions[session] : undefined)
    },
  }
}


export function persistedHandle<T extends object>(input: {
  readonly store: T
  
  readonly set: SetStoreFunction<T>
  
  readonly init: Promise<unknown> | undefined
}) {
  const [loaded, setLoaded] = createSignal(!input.init)
  const queue: (() => void)[] = []

  const write = (apply: () => void) => {
    if (untrack(loaded)) return apply()

    queue.push(apply)
  }

  
  const load = input.init?.then(() =>
    batch(() => {
      queue.splice(0).forEach((apply) => apply())
      setLoaded(true)
    }),
  )

  
  void load?.catch((cause: unknown) => console.error("[extension storage] Load or queued write failed", cause))

  const handle: Persisted<T> = {
    get value() {
      return loaded() ? input.store : undefined
    },
    ready: loaded,
    update(mutate) {
      write(() =>
        input.set(
          produce((draft) => {
            
            const returned = mutate(draft as Mutable<T>)

            if (returned !== undefined)
              throw new Error("Persisted.update must not return a value. Use set(next) to replace the value.")
          }),
        ),
      )
    },
    set(next) {
      write(() => input.set(reconcile(next)))
    },
  }

  if (load) loads.set(handle, load)

  return handle
}


export function whenLoaded<T>(handle: Persisted<T>) {
  return loads.get(handle) ?? Promise.resolve()
}


export function deferredHandle<T>(store: Accessor<Persisted<T> | undefined>): Persisted<T> {
  const queue: ((current: Persisted<T>) => void)[] = []

  
  createRenderEffect(() => {
    const current = store()

    if (current && queue.length > 0) untrack(() => queue.splice(0).forEach((apply) => apply(current)))
  })

  return {
    get value() {
      return store()?.value
    },
    ready: () => store()?.ready() ?? false,
    update(mutate) {
      const current = untrack(store)

      if (current) return current.update(mutate)
      queue.push((opened) => opened.update(mutate))
    },
    set(next) {
      const current = untrack(store)

      if (current) return current.set(next)
      queue.push((opened) => opened.set(next))
    },
  }
}


export function locatedHandle<T>(session: SessionRef, open: () => Persisted<T>) {
  const directory = createMemo(() => session.location?.directory)

  
  return deferredHandle(createMemo(on(directory, (value) => (value === undefined ? undefined : open()))))
}


export function createSessionStore<T extends object>(input: {
  readonly open: (session: SessionRef) => Persisted<T>
  readonly owner: Owner | null
  
  readonly sessions: { list(): readonly SessionRef[]; current(): SessionRef | undefined }
}) {
  const entries = new Map<string, { readonly handle: Persisted<T>; readonly dispose: () => void }>()
  
  const listed = new Set<string>()

  
  
  createRenderEffect(() => {
    const keys = new Set(input.sessions.list().map((session) => session.key))
    const routed = input.sessions.current()?.key

    untrack(() =>
      entries.forEach((entry, key) => {
        if (keys.has(key)) return void listed.add(key)

        if (key === routed || !listed.has(key)) return
        entry.dispose()
        entries.delete(key)
        listed.delete(key)
      }),
    )
  })

  const create = (session: SessionRef) => {
    
    const current = () => input.sessions.list().find((item) => item.key === session.key) ?? session

    const ref: SessionRef = {
      key: session.key,
      id: session.id,
      get tab() {
        return current().tab
      },
      get server() {
        return current().server
      },
      get pending() {
        return current().pending
      },
      get location() {
        return current().location
      },
    }

    return createRoot((dispose) => ({ handle: locatedHandle(ref, () => input.open(ref)), dispose }), input.owner)
  }

  return {
    get(session: SessionRef) {
      const existing = entries.get(session.key)

      if (existing) return existing.handle
      const created = create(session)
      entries.set(session.key, created)

      
      if (untrack(input.sessions.list).some((item) => item.key === session.key)) listed.add(session.key)

      return created.handle
    },
    dispose() {
      entries.forEach((entry) => entry.dispose())
      entries.clear()
      listed.clear()
    },
  }
}

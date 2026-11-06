import {
  batch,
  catchError,
  createContext,
  createMemo,
  createRenderEffect,
  createResource,
  createRoot,
  createSignal,
  ErrorBoundary,
  getOwner,
  on,
  onCleanup,
  onMount,
  runWithOwner,
  untrack,
  useContext,
  type Accessor,
  type Owner,
  type ParentProps,
} from "solid-js"
import { createStore } from "solid-js/store"
import { Predicate } from "effect"
import { resolveTemplate } from "@solid-primitives/i18n"
import { useDialog } from "@chassis/ui/context/dialog"
import { pluralCategory } from "@chassis/ui/context/i18n"
import {
  ExtensionContext,
  LifetimeContext,
  LinkHandler,
  Live,
  type BaseContext,
  type Catalog,
  type Cleanup,
  type Context,
  type Contract,
  type Definition,
  type Dialogs,
  type Link,
  type Links,
  type Messages,
  type Persisted,
  type Registry,
  type Ipc,
  type IpcClient,
  type IpcRef,
  type IpcSpec,
  type SessionRef,
  type SetupContext,
  type Token,
} from "@chassis/gui-extensions/sdk"
import { useLanguage } from "@/runtime/i18n/language"
import { createSessionStore, whenLoaded } from "./stores"

type Entry = { key: string; registry: string; extension: string; value: Accessor<unknown> }

export type Item<T> = { readonly key: string; readonly extension: string; readonly value: T }


type InstanceContext = SetupContext<Definition> & Context

type Instance = {
  definition: Definition
  context: InstanceContext
  dispose: () => void
  
  prepare(): Promise<readonly void[]>
  
  preload(session: SessionRef): void
}


type HostApis = Omit<Context, keyof BaseContext | "signal" | "provide">


type HostApiFactory<T> = (
  extension: string,
  owner: Owner | null,
  context: Context,
  register: (fn: Cleanup) => Cleanup,
) => T


export type HostApiFactories = {
  readonly [K in Exclude<keyof HostApis, "links" | "dialogs">]: HostApiFactory<HostApis[K]>
}

export type ExtensionStatus = "loading" | "active" | "failed" | "disabled" | "blocked"


export type ExtensionFailure = { readonly phase: "setup" | "render"; readonly error: string }

type Absent = Exclude<Live<never>, { readonly status: "active" }>


type Provider = Absent | { readonly status: "active"; readonly generation: number }

type HostState = {
  entries: Record<string, Entry[] | undefined>
  contracts: Record<string, number | undefined>
  status: Record<string, ExtensionStatus | undefined>
  failures: Record<string, ExtensionFailure | undefined>
}

type Stores = Record<string, Persisted<object> | ((session: SessionRef) => Persisted<object>)>

const pending: Absent = { status: "pending" }

const inactive = {
  disabled: { status: "inactive", reason: "disabled" },
  failed: { status: "inactive", reason: "failed" },
  blocked: { status: "inactive", reason: "blocked" },
  restarting: { status: "inactive", reason: "restarting" },
} as const satisfies Record<string, Absent>

const HostContext = createContext<ReturnType<typeof createHost>>()

export function useExtensionHost() {
  const host = useContext(HostContext)

  if (!host) throw new Error("Extension host is unavailable")

  return host
}

type HostInput = {
  definitions: readonly Definition[]
  disabled: Accessor<ReadonlySet<string> | undefined>
  apis: HostApiFactories
  
  whenMounted: (run: () => void) => () => void
  
  ipc?: (token: Ipc) => IpcClient<IpcSpec> | undefined
  
  generation?: (token: Ipc) => number
  
  failed?: (id: string) => boolean
}

export function ExtensionHostProvider(props: ParentProps<HostInput>) {
  const host = createHost(props)

  return <HostContext.Provider value={host}>{props.children}</HostContext.Provider>
}

function createHost(input: HostInput) {
  const language = useLanguage()
  const owner = getOwner()
  const provided = new Map<string, { live: Live<unknown> & { readonly status: "active" } }>()
  const generations = new Map<string, number>()

  
  const [state, setState] = createStore<HostState>({ entries: {}, contracts: {}, status: {}, failures: {} })

  const instances = new Map<string, Instance>()
  const memos = new Map<string, Accessor<readonly Item<unknown>[]>>()
  const sequence = { value: 0 }
  
  const lifetime = { disposed: false }
  
  
  const loads = new Map<string, object>()

  
  const providers = new Map<string, string | undefined>()

  const providerOf = (id: string) => {
    if (providers.has(id)) return providers.get(id)

    const found =
      input.definitions.find((definition) =>
        Object.values(definition.provides ?? {}).some((token) => token.id === id),
      ) ?? input.definitions.find((definition) => definition.id === id || id.startsWith(`${definition.id}.`))

    providers.set(id, found?.id)

    return found?.id
  }

  
  const absent = (id: string, generation: number, main: boolean): Absent => {
    const extension = providerOf(id)

    if (!extension) return inactive.disabled

    if (main ? input.disabled()?.has(extension) : state.status[extension] === "disabled") return inactive.disabled

    if (main ? input.failed?.(extension) : state.status[extension] === "failed") return inactive.failed

    
    if (!main && state.status[extension] === "blocked") return inactive.blocked

    
    if (!main && state.status[extension] === "active") return inactive.disabled

    return generation > 0 ? inactive.restarting : pending
  }

  const contractLive = (token: Contract<unknown>): Live<unknown> => {
    void state.contracts[token.id]

    return provided.get(token.id)?.live ?? absent(token.id, generations.get(token.id) ?? 0, false)
  }

  
  
  const [known, setKnown] = createSignal<ReadonlyMap<string, Ipc>>(new Map())

  const learn = (token: Token) => {
    if (token.kind !== "ipc" || !token.spec || untrack(known).has(token.id)) return

    setKnown((map) => new Map(map).set(token.id, token))
  }

  const resolve = (token: Ipc | IpcRef) => (token.spec ? token : known().get(token.id))

  
  const actives = new Map<string, Provider & { readonly status: "active" }>()

  const providerState = (token: Token): Provider => {
    if (token.kind === "contract") return contractLive(token)

    if (!input.ipc) return inactive.disabled

    const full = resolve(token)

    if (!full || !input.ipc(full)) return absent(token.id, full ? (input.generation?.(full) ?? 0) : 0, true)

    const generation = input.generation?.(full) ?? 1
    const cached = actives.get(token.id)

    if (cached?.generation === generation) return cached

    const active = { status: "active", generation } as const

    actives.set(token.id, active)

    return active
  }

  const satisfied = (definition: Definition) =>
    Object.values(definition.requires ?? {}).every((token) => untrack(() => providerState(token)).status === "active")

  
  const createItems = (id: string) => {
    const cache = new Map<string, Item<unknown>>()

    const created = runWithOwner(owner, () =>
      createMemo(() => {
        const next = (state.entries[id] ?? []).flatMap((entry) => {
          const value = entry.value()

          if (value === undefined) return []

          const previous = cache.get(entry.key)

          if (previous?.value === value) return [previous]

          const item = { key: entry.key, extension: entry.extension, value }

          cache.set(entry.key, item)

          return [item]
        })

        if (cache.size > next.length) {
          const live = new Set(next.map((item) => item.key))

          cache.forEach((_, key) => {
            if (!live.has(key)) cache.delete(key)
          })
        }

        return next
      }),
    )

    const memo = created ?? (() => [])

    memos.set(id, memo)

    return memo
  }

  const items = <T,>(registry: Registry<T>) => {
    const memo = memos.get(registry.id) ?? createItems(registry.id)

    
    
    return memo() as readonly Item<T>[]
  }

  const list = <T,>(registry: Registry<T>) => items(registry).map((item) => item.value)

  const pickLinkHandler = (link: Link) =>
    list(LinkHandler)
      .filter((item) => item.match(link))
      .reduce<LinkHandler | undefined>(
        (best, item) => (!best || (item.priority ?? 0) > (best.priority ?? 0) ? item : best),
        undefined,
      )

  const links: Links = {
    open(link) {
      const handler = untrack(() => pickLinkHandler(link))

      if (!handler) return false

      handler.open(link)

      return true
    },
    
    exists: (link) => untrack(() => pickLinkHandler(link)?.exists?.(link) ?? false),
  }

  const dialog = useDialog()

  const factories = {
    ...input.apis,
    links: () => links,
    
    dialogs: (extension, _, context, register): Dialogs => ({
      open(render, options) {
        const id = `extension:${extension}:${sequence.value++}`
        const waiting = { cancel: () => {} }
        
        const opening = new AbortController()

        
        
        const close = () => {
          opening.abort()
          waiting.cancel()
          dialog.close(id)
        }

        const handle = { close }

        if (context.signal.aborted) return handle

        
        const release = register(close)

        
        
        waiting.cancel = input.whenMounted(
          () =>
            void dialog[options?.replace ? "show" : "push"](
              () => {
                
                onCleanup(() => void release())

                return (
                  <ErrorBoundary
                    fallback={(error) => {
                      onMount(() => {
                        dialog.close(id)
                        fail(extension, error, "render")
                      })

                      return null
                    }}
                  >
                    <ExtensionContext.Provider value={context}>
                      {untrack(() => render(handle))}
                    </ExtensionContext.Provider>
                  </ErrorBoundary>
                )
              },
              undefined,
              id,
              
              
              AbortSignal.any([opening.signal, context.signal]),
            ),
        )

        return handle
      },
      active: () => !!dialog.active,
    }),
  } satisfies { readonly [K in keyof HostApis]: HostApiFactory<HostApis[K]> }

  const activate = async (definition: Definition) => {
    const load = definition.renderer

    
    
    if (!load || input.disabled()?.has(definition.id) !== false) return

    const unavailable = Object.values(definition.requires ?? {}).some((token) => {
      const provider = untrack(() => providerState(token))

      return blocked(provider)
    })

    setState("status", definition.id, unavailable ? "blocked" : "loading")

    
    if (!satisfied(definition)) return

    const attempt = {}
    const current = () => loads.get(definition.id) === attempt

    loads.set(definition.id, attempt)

    
    const [module, messages] = await Promise.all([
      load().catch((cause: unknown) => {
        if (current()) fail(definition.id, cause)

        return undefined
      }),
      loadMessages(definition.i18n, untrack(language.locale)),
    ])

    if (!current()) return

    loads.delete(definition.id)

    if (!module || lifetime.disposed) return

    
    if (instances.has(definition.id)) return

    runWithOwner(owner, () =>
      createRoot((dispose) => {
        const root = getOwner()
        const instance = createInstance(definition, dispose, root, messages)

        instances.set(definition.id, instance)

        
        if (root) root.context = { ...root.context, [ExtensionContext.id]: instance.context }

        const crash = (cause: unknown) => {
          if (instances.get(definition.id) !== instance) return

          batch(() => {
            deactivate(definition.id)
            fail(definition.id, cause)
          })
        }

        
        const setup = module.default as (ctx: InstanceContext) => void

        const start = () =>
          void Promise.try(() =>
            
            catchError(
              () =>
                untrack(() => {
                  const returned = setup(instance.context)

                  if (!Predicate.isPromiseLike(returned)) return

                  
                  void Promise.resolve(returned).catch((cause: unknown) =>
                    console.error(`[extension] ${definition.id}`, cause),
                  )
                  throw new Error(
                    "Window setup must be synchronous. Start async work with createKeyed or createLatest.",
                  )
                }),
              (cause) => queueMicrotask(() => crash(cause)),
            ),
          ).then(() => {
            if (instances.get(definition.id) !== instance) return

            setState("status", definition.id, "active")
          }, crash)

        
        if (windowStores(definition).length === 0) return start()

        
        Promise.try(instance.prepare).then(() => {
          if (instances.get(definition.id) === instance) runWithOwner(root, start)
        }, crash)
      }),
    )
  }

  const createInstance = (
    definition: Definition,
    dispose: () => void,
    root: Owner | null,
    initial: Messages,
  ): Instance => {
    const extension = definition.id
    const controller = new AbortController()
    const cleanups = new Set<Cleanup>()

    const [catalog] = createResource(language.locale, (locale) => loadMessages(definition.i18n, locale), {
      initialValue: initial,
    })

    const messages = () => catalog.latest

    
    const release = (fn: Cleanup) =>
      void Promise.try(fn).catch((cause: unknown) => console.error(`[extension] ${extension}`, cause))

    const own = (fn: Cleanup): Cleanup => {
      
      if (controller.signal.aborted) {
        release(fn)

        return () => {}
      }

      const cleanup = () => {
        if (cleanups.delete(cleanup)) return fn()
      }

      cleanups.add(cleanup)

      return cleanup
    }

    
    const late = () => controller.signal.aborted || !!useContext(LifetimeContext)?.ended

    
    const register = (fn: Cleanup): Cleanup => {
      if (late()) {
        release(fn)

        return () => {}
      }

      const cleanup = own(fn)
      const scope = getOwner()

      if (scope && scope !== root) onCleanup(() => void cleanup())

      return cleanup
    }

    const clients = new Map<string, { client: IpcClient<IpcSpec>; live: Live<unknown> }>()

    
    const ipcLive = (token: Ipc | IpcRef): Live<unknown> => {
      if (!input.ipc) return inactive.disabled

      const full = resolve(token)
      const client = full && input.ipc(full)

      if (!full || !client) return absent(token.id, full ? (input.generation?.(full) ?? 0) : 0, true)

      const generation = input.generation?.(full) ?? 1
      const cached = clients.get(token.id)

      if (cached?.client === client && cached.live.status === "active" && cached.live.generation === generation)
        return cached.live

      const value = Object.assign({}, client, {
        on: (name: string, listener: Parameters<typeof client.on>[1]) => register(client.on(name, listener)),
      })

      const live = { status: "active", value, generation } as const

      clients.set(token.id, { client, live })

      return live
    }

    const lives = new Map<string, Accessor<Live<unknown>>>()

    const liveOf = (token: Token) => {
      const existing = lives.get(token.id)

      if (existing) return existing

      const read = Live.accessor(token.kind === "contract" ? () => contractLive(token) : () => ipcLive(token))

      lives.set(token.id, read)

      return read
    }

    const value = (read: Accessor<Live<unknown>>) => {
      const current = read()

      return current.status === "active" ? current.value : undefined
    }

    
    
    const used = (token: Token) => {
      const read = liveOf(token)

      if (token.kind !== "ipc" || token.spec) return read

      return Object.assign(read, {
        load(full: Ipc) {
          if (full.id !== token.id) throw new Error(`Ipc "${full.id}" does not resolve the reference "${token.id}"`)
          learn(full)

          return read
        },
      })
    }

    
    const usable = { ...definition.provides, ...definition.uses }

    Object.values(usable).forEach(learn)
    Object.values(definition.requires ?? {}).forEach(learn)

    const stores: Stores = {}

    const context = {
      id: extension,
      signal: controller.signal,
      add<T>(registry: Registry<T>, item: T | (() => T | undefined)) {
        if (late()) return () => {}

        
        const read =
          
          
          typeof item === "function"
            ? runWithOwner(getOwner() ?? root, () => createMemo(item as () => T | undefined))
            : () => item

        const key = `${extension}/${++sequence.value}`

        setState("entries", registry.id, (entries = []) => [
          ...entries,
          { key, registry: registry.id, extension, value: read ?? (() => undefined) },
        ])

        return register(() =>
          setState("entries", registry.id, (entries = []) => entries.filter((entry) => entry.key !== key)),
        )
      },
      list,
      provide<T>(token: Contract<T> | Ipc, impl: T) {
        if (token.kind === "ipc") throw new Error("Ipcs are provided by an extension's main entry")

        if (late()) return () => {}

        const generation = (generations.get(token.id) ?? 0) + 1

        generations.set(token.id, generation)

        const entry = { live: { status: "active", value: impl, generation } as const }

        provided.set(token.id, entry)
        setState("contracts", token.id, (version = 0) => version + 1)

        return register(() => {
          if (provided.get(token.id) !== entry) return

          provided.delete(token.id)
          setState("contracts", token.id, (version = 0) => version + 1)
        })
      },
      uses: Object.fromEntries(Object.entries(usable).map(([name, token]) => [name, used(token)])),
      
      requires: Object.fromEntries(
        Object.entries(definition.requires ?? {}).map(([name, token]) => [name, untrack(() => value(liveOf(token)))]),
      ),
      stores,
      t(key: string, params?: Record<string, string | number | boolean>) {
        const template = messages()[key]

        if (template !== undefined) return resolveTemplate(template, params)

        
        return language.t(key as Parameters<typeof language.t>[0], params)
      },
      plural(key: string, count: number, params?: Record<string, string | number | boolean>) {
        const current = messages()
        const template = current[`${key}.${pluralCategory(language.intl(), count)}`] ?? current[`${key}.other`]

        if (template !== undefined) return resolveTemplate(template, { ...params, count })

        
        return language.plural(key as Parameters<typeof language.plural>[0], count, params)
      },
    }

    
    const created = new Map<string, HostApis[keyof HostApis]>()

    Object.defineProperties(
      context,
      Object.fromEntries(
        Object.entries(factories).map(([name, create]) => [
          name,
          {
            enumerable: true,
            get() {
              if (!created.has(name)) created.set(name, create(extension, root, typed, register))

              return created.get(name)
            },
          },
        ]),
      ),
    )

    
    
    
    const typed = context as unknown as InstanceContext

    const sessions: ReturnType<typeof createSessionStore<object>>[] = []

    return {
      definition,
      context: typed,
      prepare() {
        const storage = typed.storage

        const loaded = windowStores(definition).flatMap(([name, declaration]) => {
          if (declaration.scope === "global") {
            const handle = storage.store(name, { ...declaration, scope: "global" })

            stores[name] = handle

            return [whenLoaded(handle)]
          }

          const store = createSessionStore({
            open: (session) => storage.store(name, { ...declaration, scope: { session } }),
            owner: root,
            sessions: typed.sessions,
          })

          stores[name] = store.get
          sessions.push(store)

          return []
        })

        if (sessions.length > 0) own(() => sessions.forEach((store) => store.dispose()))

        return Promise.all(loaded)
      },
      preload: (session) => sessions.forEach((store) => store.get(session)),
      dispose() {
        controller.abort()
        
        batch(() => {
          Array.from(cleanups).reverse().forEach(release)
          cleanups.clear()
          Object.entries(state.entries).forEach(([registry, entries]) => {
            if (!entries?.some((entry) => entry.extension === extension)) return

            setState("entries", registry, (list = []) => list.filter((entry) => entry.extension !== extension))
          })
        })
        
        release(dispose)
      },
    }
  }

  const deactivate = (id: string) => {
    loads.delete(id)

    const instance = instances.get(id)

    if (!instance) return

    instances.delete(id)
    instance.dispose()
  }

  const fail = (id: string, cause: unknown, phase: ExtensionFailure["phase"] = "setup") => {
    console.error(`[extension] ${id}`, cause)
    batch(() => {
      
      if (phase === "setup") setState("status", id, "failed")

      setState("failures", id, {
        phase,
        error: cause instanceof Error ? (cause.stack ?? cause.message) : String(cause),
      })
    })
  }

  const replaced = new Map<string, Definition>()
  const latest = (definition: Definition) => replaced.get(definition.id) ?? definition

  
  
  const ready = createMemo<boolean>(
    (settled) =>
      settled ||
      (!!input.disabled() &&
        input.definitions.every((definition) => {
          if (!definition.renderer) return true

          const status = state.status[definition.id]

          if (status === "active" || status === "failed" || status === "disabled" || status === "blocked") return true

          return Object.values(definition.requires ?? {}).some((token) => {
            const provider = providerState(token)

            return blocked(provider)
          })
        })),
    false,
  )

  
  
  input.definitions.forEach((definition) => {
    const tokens = Object.values(definition.requires ?? {})

    if (tokens.length === 0) return

    const key = createMemo(() => {
      const providers = tokens.map(providerState)

      if (providers.every((provider) => provider.status === "active"))
        return providers.map((provider) => (provider.status === "active" ? provider.generation : 0)).join(",")

      return providers.some(blocked) ? "blocked" : undefined
    })

    createRenderEffect(
      on(key, (value) =>
        untrack(() =>
          batch(() => {
            const id = definition.id

            deactivate(id)

            if (input.disabled()?.has(id) !== false) return

            if (value === undefined) return setState("status", id, "loading")

            if (value === "blocked") return setState("status", id, "blocked")

            void activate(latest(definition))
          }),
        ),
      ),
    )
  })

  
  
  createMemo(() => {
    const disabled = input.disabled()

    if (!disabled) return

    untrack(() =>
      batch(() => {
        input.definitions
          .filter((definition) => disabled.has(definition.id))
          .forEach((definition) => {
            deactivate(definition.id)
            setState("status", definition.id, "disabled")
          })
        input.definitions
          .filter((definition) => !disabled.has(definition.id))
          .forEach((definition) => {
            if (instances.has(definition.id) || state.status[definition.id] === "loading") return

            void activate(latest(definition))
          })
      }),
    )
  })

  onCleanup(() => {
    lifetime.disposed = true
    loads.clear()
    Array.from(instances.keys()).forEach(deactivate)
  })

  return {
    state,
    ready,
    list,
    items,
    links,
    definitions: () => input.definitions.map(latest),
    context: (id: string): Context | undefined => instances.get(id)?.context,
    fail,
    
    preload(session: SessionRef) {
      instances.forEach((instance) => instance.preload(session))
    },
    
    reload(id: string, next?: Definition) {
      const definition = next ?? input.definitions.find((item) => item.id === id)

      if (!definition) return

      if (next) replaced.set(id, next)

      batch(() => {
        deactivate(id)
        setState("failures", id, undefined)
        void activate(latest(definition))
      })
    },
  }
}


function windowStores(definition: Definition) {
  return Object.entries(definition.stores ?? {}).flatMap(([name, declaration]) =>
    declaration.scope === "main" ? [] : [[name, declaration] as const],
  )
}


function blocked(provider: Provider) {
  return provider.status === "inactive" && provider.reason !== "restarting"
}


async function loadMessages(catalog: Catalog | undefined, locale: string): Promise<Messages> {
  const english = catalog?.en ?? {}
  const source = catalog?.[locale]

  if (!source || locale === "en") return english

  const loaded =
    
    
    typeof source === "function"
      ? await source().then(
          (module) => module.default,
          () => ({}),
        )
      : source

  return { ...english, ...loaded }
}

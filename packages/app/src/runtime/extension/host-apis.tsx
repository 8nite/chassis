import {
  batch,
  createComputed,
  createEffect,
  createMemo,
  createSignal,
  getOwner,
  on,
  runWithOwner,
  untrack,
  type Accessor,
} from "solid-js"
import { createStore, produce, type Store } from "solid-js/store"
import type { Schema } from "effect"
import { useDialog } from "@chassis/ui/context/dialog"
import { base64Encode } from "@chassis/util/encode"
import {
  Panel,
  type Build,
  type Layout,
  type MountedSession,
  type OpenOptions,
  type PanelSidebar,
  type PanelState,
  type ServerRef,
  type SessionRef,
  type SessionScreen,
  type Storage,
  type StorageScope,
  type StoreFrom,
  type StoreOptions,
} from "@chassis/gui-extensions/sdk"
import { usePlatform } from "@/runtime/platform/platform"
import { same } from "@/runtime/persistence/equality"
import { Persist, persisted, removePersisted } from "@/runtime/persistence/storage"
import { useGlobal, type ServerCtx } from "@/runtime/server/runtime"
import { ServerConnection, serverName, useServers } from "@/runtime/server/registry"
import { useDirectoryPicker } from "@/workspaces/selection/picker"
import { SessionRouteKey, SessionStateKey, type ServerScope } from "@/runtime/server/scope"
import { findSessionTab, tabKey, useTabs } from "@/shell/tabs/tabs"
import { useCurrentRoute, useLayout } from "@/shell/state/layout"
import { terminalFontFamily, useSettings } from "@/settings/model"
import { useSettingsSurface } from "@/settings/surface"
import { formatKeybindParts, useCommand } from "@/shell/commands/command"
import { createMediaQuery } from "@solid-primitives/media"
import { useIsRouting, useLocation } from "@solidjs/router"
import { useLanguage } from "@/runtime/i18n/language"
import { createEmbeds } from "./embeds"
import { useExtensionHost, type HostApiFactories } from "./host"
import { createLocatedWrites } from "./located"
import type { Region } from "./panels"
import { deferredHandle, globalStoreTarget, persistedHandle, storeImports, storeName } from "./stores"

type Attached = {
  sessions: Accessor<readonly SessionRef[]>
  current: Accessor<MountedSession | undefined>
  screen: Accessor<SessionScreen | undefined>
  scope: (server: string) => ServerScope
  
  scoped: (name: string) => void
  layout: Omit<Layout, "narrow" | "settings" | "project" | "stored"> & {
    stored(extension: string, session: SessionRef): readonly string[]
  }
  settings: (page?: string) => void
  project: (server: string, title: string) => void
  font: Accessor<string>
  routing: Accessor<boolean>
  path: Accessor<string>
  keybind: (command: string) => readonly string[]
  matches: (command: string, event: KeyboardEvent) => boolean
  servers: Accessor<readonly string[]>
  server: (id: string) => ServerRef | undefined
}


export function createHostApis() {
  const platform = usePlatform()
  const dialog = useDialog()
  const language = useLanguage()
  
  const desktop = createMediaQuery("(min-width: 768px)")
  const narrow = () => !desktop()
  const [attached, setAttached] = createSignal<Attached>()
  const removed = new Set<(value: { server: string; directory: string }) => void>()
  const memory = new Map<string, ReturnType<Storage["memory"]>>()
  const current = () => attached()
  
  const early: ((value: Attached) => void)[] = []
  
  const located = createLocatedWrites()

  
  const write = (run: (value: Attached) => void) => {
    const value = untrack(attached)

    if (value && early.length === 0) return run(value)
    early.push(run)
  }

  
  const flush = () => {
    const value = untrack(attached)

    if (!value) return
    batch(() =>
      early
        .splice(0)
        .forEach(
          (run) => void Promise.try(() => run(value)).catch((cause: unknown) => console.error("[extension]", cause)),
        ),
    )
  }

  const embeds = createEmbeds({
    bridge: platform.extensions,
    zoom: () => platform.webviewZoom?.() ?? 1,
    dialog: () => !!dialog.active,
  })

  
  const target = (
    extension: string,
    key: string,
    scope: Exclude<StorageScope, "global">,
    from: StoreFrom | readonly StoreFrom[] | undefined,
    connected: Attached,
  ) => {
    const name = storeName(extension, key)

    if ("session" in scope) {
      const location = scope.session.location

      if (!location) throw new Error("Session storage requires a session location")
      connected.scoped(name)
      const server = connected.scope(scope.session.server.id)
      const directory = base64Encode(location.directory)
      const session = SessionStateKey.from(server, SessionRouteKey.fromRoute(directory, scope.session.id))

      return {
        ...Persist.serverSession(server, directory, scope.session.id, name),
        copyFrom: storeImports(from, session),
      }
    }

    const copyFrom = storeImports(from)

    if (!scope.directory) return { ...Persist.serverGlobal(connected.scope(scope.server), name), copyFrom }

    return { ...Persist.serverWorkspace(connected.scope(scope.server), base64Encode(scope.directory), name), copyFrom }
  }

  const apis: HostApiFactories = {
    storage: (extension, owner) => ({
      store<S extends Schema.ConstraintCodec<object, unknown>>(key: string, options: StoreOptions<S>) {
        const open = (at: Parameters<typeof persisted>[0]) => {
          const pair = persisted(at, options.schema, options.initial, platform)

          return persistedHandle({ store: pair[0], set: pair[1], init: pair[3].promise })
        }

        const scope = options.scope

        
        return runWithOwner(getOwner() ?? owner, () => {
          if (!scope || scope === "global") return open(globalStoreTarget(extension, key, options.from))

          const scoped = (connected: Attached | undefined) =>
            connected && open(target(extension, key, scope, options.from, connected))

          
          
          if (!("session" in scope)) return deferredHandle(createMemo(on(attached, scoped)))

          const directory = createMemo(() => scope.session.location?.directory)

          return deferredHandle(
            createMemo(
              on([attached, directory], ([connected, value]) => (value === undefined ? undefined : scoped(connected))),
            ),
          )
        })!
      },
      memory<T extends object>(key: string, options: { readonly initial: T }) {
        const name = `${extension}.${key}`
        const existing = memory.get(name)

        if (existing) {
          
          return existing as readonly [Store<T>, (mutation: (draft: T) => void) => void]
        }

        const [store, setStore] = createStore(options.initial)
        const value = [store, (mutation: (draft: T) => void) => setStore(produce(mutation))] as const

        memory.set(name, value)

        return value
      },
      remove(key, options) {
        const scope = options?.scope

        if (!scope || scope === "global")
          return removePersisted(globalStoreTarget(extension, key, options?.from), platform)

        const run = (connected: Attached) =>
          removePersisted(target(extension, key, scope, options?.from, connected), platform)

        
        write((connected) =>
          "session" in scope && !scope.session.location
            ? located.hold(scope.session, () => write(run))
            : run(connected),
        )
      },
    }),
    system: () => ({
      copy: (text) => platform.writeClipboardText?.(text) ?? navigator.clipboard.writeText(text),
      async save(file) {
        if (platform.saveFile) return platform.saveFile({ defaultPath: file.name }, file.content)
        const url = URL.createObjectURL(new Blob([file.content], { type: "application/octet-stream" }))
        const link = document.createElement("a")
        link.href = url
        link.download = file.name
        link.click()
        URL.revokeObjectURL(url)

        return true
      },
      openExternal(url) {
        if (platform.openLocalFile && URL.canParse(url) && new URL(url).protocol === "file:")
          return platform.openLocalFile(url)
        platform.openExternal(url)
      },
    }),
    desktop: () =>
      platform.platform === "desktop"
        ? {
            os: platform.os ?? "linux",
            window: platform.windowID,
            zoom: () => platform.webviewZoom?.() ?? 1,
            launch: (path, app) => platform.openPath?.(path, app) ?? Promise.resolve(),
            reveal: (path) => platform.revealPath?.(path) ?? Promise.resolve(false),
            installed: (app) => platform.checkAppExists?.(app) ?? Promise.resolve(false),
            forceFocus: (enabled) => platform.setForceFocus?.(enabled) ?? Promise.resolve(),
          }
        : undefined,
    build: () => ({
      version: platform.version ?? "",
      
      channel: (import.meta.env.VITE_CHASSIS_CHANNEL ?? "local") as Build["channel"],
      platform: platform.platform,
      packaged: platform.extensions?.packaged ?? false,
    }),
    locale: () => ({
      locale: language.intl,
      direction: language.direction,
      setDirection: language.setDirection,
    }),
    
    appearance: () => ({ font: () => current()?.font() ?? terminalFontFamily(undefined) }),
    router: () => ({
      routing: () => current()?.routing() ?? false,
      path: () => current()?.path() ?? "",
    }),
    keybinds: () => ({
      keybind: (command) => current()?.keybind(command) ?? [],
      keys: (bind) => formatKeybindParts(bind, language.t),
      matches: (command, event) => current()?.matches(command, event) ?? false,
    }),
    servers: () => ({
      list: () => current()?.servers() ?? [],
      get: (id) => current()?.server(id),
    }),
    workspaces: (_extension, _owner, _context, register) => ({
      on(_event, handler) {
        removed.add(handler)

        return register(() => {
          removed.delete(handler)
        })
      },
    }),
    sessions: () => ({
      list: () => current()?.sessions() ?? [],
      current: () => current()?.current(),
    }),
    screen: () => ({
      current: () => {
        const attached = current()

        return attached?.current() ? attached.screen() : undefined
      },
    }),
    
    layout: (extension) => ({
      narrow,
      ready: () => current()?.layout.ready() ?? false,
      open: (key, session, options) => write((value) => value.layout.open(key, session, options)),
      close: (key, session) => write((value) => value.layout.close(key, session)),
      toggle: (key, session) => write((value) => value.layout.toggle(key, session)),
      state: (key, session) => current()?.layout.state(key, session) ?? "closed",
      stored: (session) => current()?.layout.stored(extension, session) ?? [],
      side: {
        opened: (session) => current()?.layout.side.opened(session) ?? false,
        toggle: (session) => write((value) => value.layout.side.toggle(session)),
      },
      sidebar: { opened: () => current()?.layout.sidebar.opened() ?? true },
      dock: {
        opened: (session) => current()?.layout.dock.opened(session) ?? false,
        placement: () => current()?.layout.dock.placement() ?? "side",
      },
      scroll: {
        get: (session, key) => current()?.layout.scroll.get(session, key),
        set: (session, key, value) => write((connected) => connected.layout.scroll.set(session, key, value)),
      },
      settings: (page) => write((value) => value.settings(page)),
      project: (server, title) => write((value) => value.project(server, title)),
    }),
    embeds: () => embeds,
  }

  return {
    apis,
    
    whenMounted(run: () => void) {
      const state = { cancelled: false }

      write(() => {
        if (!state.cancelled) run()
      })

      return () => {
        state.cancelled = true
      }
    },
    attach(value: Attached) {
      setAttached(() => value)
      
      queueMicrotask(flush)

      return () => {
        if (attached() === value) setAttached(undefined)
      }
    },
    workspaceRemoved(value: { server: string; directory: string }) {
      removed.forEach((handler) => handler(value))
    },
  }
}

export type HostApis = ReturnType<typeof createHostApis>

export { ExtensionAttachmentProvider, useExtensionAttachment } from "./attachment"


export function createExtensionAttachment(apis: HostApis) {
  const global = useGlobal()
  const tabs = useTabs()
  const layout = useLayout()
  const route = useCurrentRoute()
  const settings = useSettings()
  const surface = useSettingsSurface()
  const host = useExtensionHost()
  const command = useCommand()
  const location = useLocation()
  const desktop = createMediaQuery("(min-width: 768px)")
  const narrow = () => !desktop()
  
  
  const [screen, setScreen] = createSignal<SessionScreen>()
  const [routedView, setRoutedView] = createSignal<Accessor<MountedSession>>()
  const refs = new Map<string, SessionRef>()

  const connection = (id: string) => global.servers.list().find((item) => ServerConnection.key(item) === id)
  const servers = useServers()

  
  
  const owner = getOwner()
  const serverRefs = new Map<string, ServerRef>()

  const server = (id: string): ServerRef | undefined => {
    const conn = connection(id)

    if (!conn) return
    const existing = serverRefs.get(id)

    if (existing) return existing
    const key = ServerConnection.Key.make(id)
    
    
    let started: Accessor<ServerCtx> | undefined

    const live = () => {
      started ??= runWithOwner(owner, () =>
        createMemo<ServerCtx>(
          (previous) => global.serverCtx(key) ?? previous,
          global.ensureServerCtx(connection(id) ?? conn),
        ),
      )!

      return started()
    }

    
    const listed = () => connection(id) ?? live().sdk.server

    const ref: ServerRef = {
      id,
      get name() {
        return serverName(listed()) || id
      },
      get url() {
        return live().sdk.url
      },
      get password() {
        return live().sdk.server.http.password
      },
      get client() {
        return live().sdk.api
      },
      get data() {
        return live().data
      },
      get local() {
        return ServerConnection.local(listed())
      },
      get builtin() {
        return ServerConnection.builtin(listed())
      },
      get compatible() {
        return !global.servers.health[key]?.incompatible
      },
      get connected() {
        return live().sdk.connection.status() === "connected"
      },
    }

    serverRefs.set(id, ref)

    return ref
  }

  const sessions = createMemo(() => {
    const owned = new Set(tabs.store.filter((tab) => tab.type === "session").map(tabKey))
    Array.from(refs).forEach(([key, ref]) => {
      if (!owned.has(ref.tab)) refs.delete(key)
    })
    tabs.store.forEach((tab) => {
      if (tab.type !== "session") return
      const target = server(tab.server)

      if (!target) return
      Array.from(new Set([tab.sessionId, tab.routeSessionId ?? tab.sessionId])).forEach((id) => {
        const key = `${tab.server}\n${id}`

        if (refs.has(key)) return
        refs.set(key, {
          key,
          id,
          tab: tabKey(tab),
          server: target,
          get pending() {
            return target.data.session.creating(id)
          },
          get location() {
            return target.data.session.get(id)?.location
          },
        })
      })
    })

    return Array.from(refs.values())
  })

  const routed = createMemo(() => {
    const value = route()

    return value.type === "session" ? `${value.server}\n${value.sessionId}` : undefined
  })

  const current = createMemo(() => {
    const key = routed()
    const view = routedView()?.()

    return key && view?.key === key ? view : undefined
  })

  const scope = (id: string) => {
    const conn = connection(id)

    if (!conn) throw new Error(`Server ${id} is unavailable`)

    return global.ensureServerCtx(conn).sdk.scope
  }

  
  
  const stateKey = (session: SessionRef) => {
    const location = session.location

    if (!location) return

    return SessionStateKey.from(
      servers.scope(ServerConnection.Key.make(session.server.id)),
      SessionRouteKey.fromRoute(base64Encode(location.directory), session.id),
    )
  }

  
  const stateKeys = createMemo<ReadonlyMap<string, string>>(
    (previous) =>
      new Map(
        sessions().flatMap((session) => {
          const value = stateKey(session) ?? previous.get(session.key)

          return value ? [[session.key, value] as const] : []
        }),
      ),
    new Map(),
  )

  
  
  
  const lastKeys = new Map<string, string>()
  createComputed(() => {
    const next = stateKeys()
    Array.from(lastKeys.keys()).forEach((key) => {
      if (!next.has(key)) lastKeys.delete(key)
    })
    next.forEach((to, key) => {
      if (!lastKeys.has(key)) lastKeys.set(key, to)
    })

    if (!layout.ready()) return
    next.forEach((to, key) => {
      const from = lastKeys.get(key)

      if (!from || from === to) return
      layout.panel.copy(from, to)
      lastKeys.set(key, to)
    })
  })

  const shellTab = (session: SessionRef) =>
    findSessionTab(tabs.store, ServerConnection.Key.make(session.server.id), session.id)

  const sideOpened = (session: SessionRef) => !!tabs.region(shellTab(session), "side")
  const dockOpened = (session: SessionRef) => !!tabs.region(shellTab(session), "dock")
  const setDock = (session: SessionRef, opened: boolean) => tabs.setRegion(shellTab(session), "dock", opened)

  
  const sideVisits = createMemo<ReadonlyMap<string, object>>(
    (previous) =>
      new Map(
        sessions().flatMap((session) =>
          sideOpened(session) ? [[session.key, previous.get(session.key) ?? {}] as const] : [],
        ),
      ),
    new Map(),
  )

  
  
  const openedFor = new WeakMap<object, string>()

  
  const provider = (key: string) => {
    const extension = key.slice(0, key.indexOf(":"))
    const matches = host.items(Panel).filter((item) => item.extension === extension)

    return matches.find((item) => item.value.region === "side") ?? matches[0]
  }

  const mountedSession = (session: SessionRef) => {
    const view = current()

    return view?.key === session.key ? view : undefined
  }

  
  const visit = createMemo(on(routed, (_key, _previous, count: number = 0) => count + 1))

  
  
  
  
  const [mobile, setMobile] = createStore<{ session: string | undefined; view: string; visit: number }>({
    session: undefined,
    view: "session",
    visit: 0,
  })

  const mobileView = createMemo(() =>
    mobile.session === current()?.key && mobile.visit === visit() ? mobile.view : "session",
  )

  const selectMobile = (session: SessionRef, view: string) =>
    setMobile({ session: session.key, view, visit: session.key === routed() ? visit() : visit() + 1 })

  
  const listed = (session: SessionRef, value: string, adding?: string) => {
    const view = mountedSession(session)
    const currentScreen = screen()

    if (!view || !currentScreen) return []
    const all = layout.panel.state(value).all
    const stored = adding && !all.includes(adding) ? [...all, adding] : all

    return untrack(() =>
      host
        .items(Panel)
        .filter((item) => item.value.region === "side")
        .flatMap((item) => {
          const prefix = `${item.extension}:`
          const open = stored.flatMap((key) => (key.startsWith(prefix) ? [key.slice(prefix.length)] : []))

          return item.value
            .list({
              get session() {
                return mountedSession(session) ?? view
              },
              screen: currentScreen,
              open,
            })
            .map((tab) => ({ key: `${prefix}${tab.id}`, tab }))
        }),
    )
  }

  
  const located = createLocatedWrites()

  const open = (key: string, session: SessionRef, options?: OpenOptions) => {
    const item = provider(key)

    if (item?.value.region === "dock") return setDock(session, true)
    const value = stateKey(session)

    if (!value) return located.hold(session, () => open(key, session, options))
    const placement = options?.tab ?? "open"

    
    if (placement === "append") return layout.panel.append(value, key)

    
    if (placement === "select")
      return batch(() => {
        tabs.setRegion(shellTab(session), "side", true)
        layout.panel.append(value, key)
        layout.panel.focus(value, key)
      })
    
    const known = listed(session, value, key)
    const transient = new Set(known.flatMap((entry) => (entry.tab.transient ? [entry.key] : [])))
    const first = known.some((entry) => entry.key === key && entry.tab.first)
    batch(() => {
      if (narrow() && !options?.background) {
        setDock(session, false)

        if (item?.value.mobile) selectMobile(session, `${item.extension}:${item.value.id}`)

        
        if (mountedSession(session) && !known.some((entry) => entry.key === key && !entry.tab.transient)) return
      }

      
      if (!narrow() || options?.background) tabs.setRegion(shellTab(session), "side", true)

      
      if (known.some((entry) => entry.key === key && entry.tab.pinned)) return layout.panel.focus(value, key)

      if (placement === "preview") return layout.panel.preview(value, key, transient)
      layout.panel.open(value, key, transient, first)
    })
  }

  const close = (key: string, session: SessionRef) => {
    const item = provider(key)

    if (item?.value.region === "dock") return setDock(session, false)
    const value = stateKey(session)

    if (!value) return located.hold(session, () => close(key, session))
    const tab = listed(session, value).find((entry) => entry.key === key)?.tab
    layout.panel.close(value, key)
    const view = mountedSession(session)
    const currentScreen = screen()

    if (view && tab && currentScreen) item?.value.close?.({ tab, session: view, screen: currentScreen })
  }

  
  const [region, setRegion] = createSignal<Region>()
  
  const [sidebar, setSidebar] = createSignal<PanelSidebar>()

  const opened = createMemo(
    () => Array.from(new Set((region()?.entries() ?? []).flatMap((entry) => entry.tab.file ?? []))),
    [],
    { equals: same },
  )

  const state = (key: string, session: SessionRef): PanelState => {
    if (provider(key)?.value.region === "dock") return dockOpened(session) ? "visible" : "closed"
    const value = stateKey(session)

    if (!value) return "closed"
    const panel = layout.panel.state(value)
    const active = mountedSession(session) ? (region()?.active() ?? panel.active) : panel.active

    if (active !== key) return panel.all.includes(key) ? "open" : "closed"

    return sideOpened(session) ? "visible" : "active"
  }

  
  const picker = useDirectoryPicker()
  const [projects, setProjects] = createSignal<readonly { server: string; title: string }[]>([])
  createEffect(() => {
    const pending = projects()

    const ready = pending.flatMap((request) => {
      const server = servers.list.find((conn) => ServerConnection.key(conn) === request.server)

      return server ? [{ request, server }] : []
    })

    if (ready.length === 0) return
    setProjects(pending.filter((request) => !ready.some((item) => item.request === request)))
    untrack(() =>
      ready.forEach(({ request, server }) =>
        picker({
          server,
          title: request.title,
          onSelect: (value) => {
            const directory = Array.isArray(value) ? value[0] : value

            if (!directory) return
            const key = ServerConnection.key(server)
            servers.projects.forServer(key).open(directory)
            void tabs.newDraft({ server: key, directory })
          },
        }),
      ),
    )
  })

  const toggle = (key: string, session: SessionRef) => {
    if (provider(key)?.value.region === "dock") return setDock(session, !dockOpened(session))
    const value = stateKey(session)

    if (!value) return located.hold(session, () => toggle(key, session))
    const region = sideVisits().get(session.key)

    if (state(key, session) === "visible") {
      batch(() => {
        close(key, session)

        
        if (region && openedFor.get(region) === key && layout.panel.state(value).all.length === 0)
          tabs.setRegion(shellTab(session), "side", false)
      })

      return
    }

    
    if (region) openedFor.delete(region)
    open(key, session)
    const opened = sideVisits().get(session.key)

    if (!region && opened) openedFor.set(opened, key)
  }

  const setScroll = (session: SessionRef, key: string, next: { readonly x: number; readonly y: number }) => {
    const value = stateKey(session)

    if (!value) return located.hold(session, () => setScroll(session, key, next))
    layout.panel.setScroll(value, key, next)
  }

  const mounted: Attached = {
    sessions,
    current,
    screen,
    scope,
    scoped: layout.sessionState.track,
    project: (server, title) => setProjects((pending) => [...pending, { server, title }]),
    font: () => terminalFontFamily(settings.appearance.terminalFont()),
    routing: useIsRouting(),
    path: () => `${location.pathname}${location.search}`,
    keybind: command.keybindParts,
    matches: command.matches,
    servers: () => global.servers.list().map(ServerConnection.key),
    server,
    
    settings: (page) => surface.open(page as Parameters<typeof surface.open>[0]),
    layout: {
      ready: layout.ready,
      open,
      close,
      toggle,
      state,
      stored(extension, session) {
        const value = stateKey(session)

        if (!value) return []
        const prefix = `${extension}:`

        return layout.panel
          .state(value)
          .all.flatMap((key) => (key.startsWith(prefix) ? [key.slice(prefix.length)] : []))
      },
      side: {
        opened: sideOpened,
        toggle: (session) => tabs.setRegion(shellTab(session), "side", !sideOpened(session)),
      },
      
      sidebar: { opened: () => sidebar()?.opened() ?? true },
      dock: {
        opened: dockOpened,
        placement: settings.general.terminalPlacement,
      },
      scroll: {
        get(session, key) {
          const value = stateKey(session)

          return value ? layout.panel.scroll(value, key) : undefined
        },
        set: setScroll,
      },
    },
  }

  return {
    
    attach: () => apis.attach(mounted),
    
    current,
    region(value: Region) {
      setRegion(() => value)

      return () => {
        if (region() === value) setRegion(undefined)
      }
    },
    
    sidebar(value: PanelSidebar) {
      setSidebar(() => value)

      return () => {
        if (sidebar() === value) setSidebar(undefined)
      }
    },
    
    files: {
      opened,
      active: () => region()?.selected()?.tab.file,
    },
    mobile: {
      current: mobileView,
      select(view: string) {
        const session = current()

        if (session) selectMobile(session, view)
      },
    },
    
    screen(value: SessionScreen) {
      setScreen(() => value)

      return () => {
        if (screen() === value) setScreen(undefined)
      }
    },
    
    mount(view: Accessor<MountedSession>) {
      setRoutedView(() => view)

      return () => {
        if (routedView() === view) setRoutedView(undefined)
      }
    },
    
    preload(view: MountedSession) {
      untrack(() => host.preload(view))
    },
  }
}

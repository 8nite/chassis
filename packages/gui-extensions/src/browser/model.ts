import { batch, createRoot, createSignal, getOwner, onCleanup } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { makeEventListener } from "@solid-primitives/event-listener"
import type { Browser } from "@chassis/plugin-browser/rpc"
import { createKeyed, type SessionRef, type SetupContext } from "../sdk"
import { readHref } from "./comment"
import {
  createConnection,
  unavailable,
  type Connection,
  type InspectEvent,
  type Registration,
  type Zoom,
} from "./connection"
import { recordable, remember, withIcon } from "./history"
import type definition from "./index"
import { workspaceFileURL } from "./link"
import { BrowserPane, type PaneEvent } from "./ipc"

type Session = Pick<SessionRef, "key">


type Attachment = {
  registration?: number
  browser: Browser.State | null
  embeds: Readonly<Record<string, string>>
  suspended: boolean
  error?: string
}

type Live = {
  ref: SessionRef
  connection: Connection
  registration?: Registration
  revision: number
  
  held: { mirror?: () => void; focus?: Browser.TabID }
  
  previews: string[]
  dispose: () => void
}

type ModelState = {
  attachments: Record<string, Attachment | undefined>
  
  unsupported: Record<string, true | undefined>
  errors: Record<string, string | undefined>
  
  pages: Record<string, Record<string, PageDetail | undefined> | undefined>
}


type PageDetail = { icon?: string; zoom: number }


type PaneHandle = {
  visible: () => boolean
  address: () => string
  reload: () => void
  inspectable: () => boolean
  
  inspect: () => void
  
  focusAddress: () => void
}

export type Model = ReturnType<typeof createModel>



export function createModel(ctx: SetupContext<typeof definition>) {
  const sessions = ctx.sessions
  const layout = ctx.layout
  const links = ctx.links
  
  
  const pane = ctx.uses.pane.load(BrowserPane)

  const client = () => {
    const current = pane()

    return current.status === "active" ? current.value : undefined
  }

  const owner = getOwner()
  const history = ctx.stores.history
  const [state, setState] = createStore<ModelState>({ attachments: {}, unsupported: {}, errors: {}, pages: {} })
  const [panes, setPanes] = createSignal<readonly PaneHandle[]>([])
  const live = new Map<string, Live>()
  const listeners = new Map<string, (event: PaneEvent) => void>()
  const inspectors = new Map<string, Set<(event: InspectEvent) => void>>()
  const addressed = new Map<string, Set<(tabID: Browser.TabID) => void>>()
  
  const opening = new Set<string>()
  
  const recorded = new Map<string, string>()
  const key = (tabID: string) => `${ctx.id}:${tabID}`

  
  const describe = (error: string) => {
    if (error === "browser.pane.replaced") return ctx.t("replaced")

    if (error === "browser.address.credentials") return ctx.t("refused.credentials")

    if (error === "browser.address.workspace") return ctx.t("refused.workspace")

    if (error === "browser.address.web") return ctx.t("refused.web")

    return ctx.t("common.requestFailed")
  }

  
  
  
  const record = (session: string, next: { browser: Browser.State | null; embeds: Readonly<Record<string, string>> }) =>
    next.browser?.tabs.forEach((tab) => {
      if (tab.loading || tab.loadError || !next.embeds[tab.id] || !recordable(tab.url)) return
      const page = `${tab.url}\n${tab.title}`

      if (recorded.get(`${session}\n${tab.id}`) === page) return
      recorded.set(`${session}\n${tab.id}`, page)
      history.set({
        visits: remember(
          history.value.visits,
          { url: tab.url, title: tab.title },
          state.pages[session]?.[tab.id]?.icon,
        ),
      })
    })

  
  createKeyed(pane, (current) => current.on("event", (value) => listeners.get(value.binding)?.(value.event)))

  const wakeCurrent = () => {
    if (document.visibilityState !== "visible") return
    const view = sessions.current()

    if (view) live.get(view.key)?.connection.wake()
  }

  
  
  
  createKeyed(
    pane,
    () => {
      live.forEach((entry) => entry.connection.refresh())
      wakeCurrent()
    },
    { otherwise: () => live.forEach((entry) => entry.connection.refresh()) },
  )

  const close = (id: string) => {
    live.get(id)?.dispose()
    live.delete(id)
    opening.delete(id)
    Array.from(recorded.keys())
      .filter((item) => item.startsWith(`${id}\n`))
      .forEach((item) => recorded.delete(item))
    batch(() => {
      setState("attachments", id, undefined)
      setState("pages", id, undefined)
    })
  }

  const attach = (ref: SessionRef) => {
    const id = ref.key

    if (live.has(id) || state.unsupported[ref.server.id] || !ref.server.compatible) return

    const entry: Live = {
      ref,
      revision: 0,
      held: {},
      previews: [],
      dispose: () => undefined,
      connection: createConnection({
        client,
        listen(binding, listener) {
          listeners.set(binding, listener)

          return () => {
            listeners.delete(binding)
          }
        },
        target: () => ({ server: ref.server.id, session: ref.id }),
        
        
        focus: (tabID) => {
          if (!ref.location) {
            entry.held.focus = tabID

            return
          }

          layout.open(key(tabID), ref, { tab: "select" })
        },
        preview: (path) => preview(entry, path),
        inspect: (event) => inspectors.get(id)?.forEach((listener) => listener(event)),
        page: (event) => {
          setState("pages", id, (pages) => ({
            ...pages,
            [event.tabID]: event.icon ? { icon: event.icon, zoom: event.zoom } : { zoom: event.zoom },
          }))
          const url = tab({ key: id }, event.tabID)?.url
          const visits = url && event.icon ? withIcon(history.value.visits, url, event.icon) : undefined

          if (visits) history.set({ visits })
        },
        address: (tabID) => addressed.get(id)?.forEach((listener) => listener(tabID)),
        change: (next, mirror, native) => {
          if (next.error === "browser.pane.unsupported") {
            setState("unsupported", ref.server.id, true)

            return close(id)
          }

          if (next.registration !== entry.registration) {
            entry.registration = next.registration

            if (next.registration) entry.revision++
          }

          batch(() => {
            setState(
              "attachments",
              id,
              reconcile({
                registration: next.registration ? entry.revision : undefined,
                browser: next.browser,
                embeds: next.embeds,
                suspended: next.suspended,
                error: next.error ? describe(next.error) : undefined,
              }),
            )

            if (native) record(id, next)

            
            if (ref.location) return mirror()
            entry.held.mirror = mirror
          })
        },
        strip: {
          stored: () => layout.stored(ref),
          open(tabID) {
            if (layout.state(key(tabID), ref) === "closed") layout.open(key(tabID), ref, { tab: "append" })
          },
          close: (tabID) => layout.close(key(tabID), ref),
        },
      }),
    }

    live.set(id, entry)
    setState("attachments", id, { browser: null, embeds: {}, suspended: false })

    
    const unwatch = createRoot((dispose) => {
      
      
      createKeyed(
        () => ref.server.data,
        (data) => {
          onCleanup(
            data.on("session.created", (event) => {
              if (event.data.sessionID === ref.id) entry.connection.wake()
            }),
          )
          onCleanup(
            data.on("session.execution.started", (event) => {
              if (event.data.sessionID === ref.id) entry.connection.wake()
            }),
          )
        },
      )

      
      
      createKeyed(
        () => ref.location,
        () =>
          batch(() => {
            const held = entry.held
            entry.held = {}
            held.mirror?.()

            if (held.focus) layout.open(key(held.focus), ref, { tab: "select" })
          }),
      )

      
      createKeyed(
        () => sessions.current()?.key === ref.key && ctx.screen.current(),
        () => entry.previews.splice(0).forEach((path) => preview(entry, path)),
      )

      return dispose
    }, owner)

    if (!ref.pending) entry.connection.wake()
    entry.dispose = () => {
      unwatch()
      entry.connection.dispose()
    }
  }

  
  createKeyed(() => {
    const view = sessions.current()

    if (!view?.id) return
    const ref = sessions.list().find((item) => item.key === view.key)

    return ref?.server.compatible ? ref : undefined
  }, attach)

  
  
  createKeyed(
    () => {
      const owned = new Set(sessions.list().map((ref) => ref.key))

      const stale = Object.keys(state.attachments).filter((id) => {
        const entry = live.get(id)

        return !!entry && !(owned.has(id) && entry.ref.server.compatible)
      })

      return stale.length > 0 ? stale : undefined
    },
    (stale) => stale.forEach(close),
  )
  onCleanup(() => Array.from(live.keys()).forEach(close))

  
  
  createKeyed(() => sessions.current()?.key, wakeCurrent)
  makeEventListener(window, "focus", wakeCurrent)
  makeEventListener(document, "visibilitychange", wakeCurrent)
  makeEventListener(document, "pointerdown", wakeCurrent)
  makeEventListener(document, "keydown", wakeCurrent)

  const attachment = (session: Session) => state.attachments[session.key]

  const attached = (session: Session) => {
    const value = attachment(session)

    return value?.registration !== undefined || !!value?.browser
  }

  
  
  const pending = (session: SessionRef) => {
    const value = attachment(session)

    if (!value) return !state.unsupported[session.server.id] && session.server.compatible && !session.pending

    return value.registration !== undefined && !value.browser && !value.error
  }

  const available = (session: SessionRef) =>
    !state.unsupported[session.server.id] && !!session.id && session.server.compatible && !layout.narrow()

  const tab = (session: Session, tabID: string) => attachment(session)?.browser?.tabs.find((item) => item.id === tabID)

  const command = (session: Session, action: Browser.Action) => {
    const id = session.key
    batch(() => {
      setState("errors", id, undefined)

      if (state.attachments[id]) setState("attachments", id, "error", undefined)
    })

    
    const failed = (cause: unknown) => {
      if (action.type === "tabs.open") opening.delete(id)

      if (!unavailable(cause)) setState("errors", id, describe(cause instanceof Error ? cause.message : ""))
    }

    const connection = live.get(id)?.connection

    if (!connection) return failed(new Error("browser.pane.unavailable"))
    void connection.command(action).catch(failed)
  }

  const openURL = (session: Session, url: string) => command(session, { type: "tabs.open", url })

  
  const files = (session: Session) => {
    const screen = ctx.screen.current()

    return screen && sessions.current()?.key === session.key ? screen.file : undefined
  }

  
  
  const canOpen = (session: SessionRef, path?: string) => {
    if (!session.server.builtin || !available(session) || !attached(session)) return false

    if (path === undefined) return true
    const current = files(session)

    return !!current && !current.absolute(path)
  }

  const openFile = (session: Session, path: string) => {
    const current = files(session)

    if (current) openURL(session, workspaceFileURL(current, path))
  }

  
  
  const preview = (entry: Live, path: string) => {
    const view = sessions.current()

    if (view?.key === entry.ref.key && ctx.screen.current()) {
      links.open({ href: path, session: view, background: true })

      return
    }

    if (!entry.previews.includes(path)) entry.previews.push(path)
  }

  return {
    available,
    attached,
    canOpen,
    openFile,
    openURL,
    command,
    tab,
    
    open(session: SessionRef) {
      if (!available(session)) return
      opening.add(session.key)
      command(session, { type: "tabs.open" })
    },
    
    opened: (session: Session) => opening.delete(session.key),
    
    page: (session: Session, tabID: string) => state.pages[session.key]?.[tabID],
    zoom(session: Session, tabID: Browser.TabID, zoom: Zoom) {
      live.get(session.key)?.connection.zoom(tabID, zoom)
    },
    
    site: (session: Session, tabID: Browser.TabID) => live.get(session.key)?.connection.site(tabID),
    
    clearSite: (session: Session, tabID: Browser.TabID) => live.get(session.key)?.connection.clearSite(tabID),
    
    visits: () => history.value.visits,
    clearHistory: () => {
      recorded.clear()
      history.set({ visits: [] })
    },
    
    onAddress(session: Session, listener: (tabID: Browser.TabID) => void) {
      const set = addressed.get(session.key) ?? new Set()
      set.add(listener)
      addressed.set(session.key, set)

      return () => {
        set.delete(listener)

        if (!set.size) addressed.delete(session.key)
      }
    },
    pending,
    
    tabs(session: SessionRef, open: readonly string[]) {
      if (pending(session)) return open

      if (!attached(session)) return []

      return attachment(session)?.browser?.tabs.flatMap((item) => (open.includes(item.id) ? [item.id] : [])) ?? []
    },
    error: (session: Session) => state.errors[session.key] ?? attachment(session)?.error,
    suspended: (session: Session) => attachment(session)?.suspended ?? false,
    
    embed: (session: Session, tabID: string) => attachment(session)?.embeds[tabID],
    
    load(session: Session, tabID: Browser.TabID) {
      createKeyed(
        () => attachment(session)?.registration,
        () => live.get(session.key)?.registration?.load(tabID),
      )
    },
    closeTab(session: Session, tabID: string) {
      const item = tab(session, tabID)

      if (item) command(session, { type: "tabs.close", tabID: item.id })
    },
    focusTab(session: Session, tabID: string) {
      const item = tab(session, tabID)

      if (item && item.id !== attachment(session)?.browser?.focusedTabID)
        command(session, { type: "tabs.focus", tabID: item.id })
    },
    
    onInspect(session: Session, listener: (event: InspectEvent) => void) {
      const set = inspectors.get(session.key) ?? new Set()
      set.add(listener)
      inspectors.set(session.key, set)

      return () => {
        set.delete(listener)

        if (!set.size) inspectors.delete(session.key)
      }
    },
    inspect(session: Session, tabID: Browser.TabID, enabled: boolean) {
      live.get(session.key)?.connection.inspect(tabID, enabled)
    },
    
    highlight(session: Session, tabID: Browser.TabID, ref?: Browser.Ref) {
      live.get(session.key)?.connection.highlight(tabID, ref)
    },
    
    reveal(session: SessionRef, href: string) {
      const target = readHref(href)
      const item = target && tab(session, target.tabID)

      if (!item) return
      layout.open(key(item.id), session, { tab: "select" })

      if (target.ref) live.get(session.key)?.connection.highlight(item.id, target.ref)
    },
    pane: () => panes()[0],
    mount(handle: PaneHandle) {
      setPanes((list) => [handle, ...list])

      return () => setPanes((list) => list.filter((item) => item !== handle))
    },
  }
}

import { Browser } from "@chassis/plugin-browser/rpc"
import { DialogProvider } from "@chassis/ui/context/dialog"
import {
  batch,
  createSignal,
  For,
  Show,
  type Accessor,
  type Component,
  type JSX,
  type ParentComponent,
  type ParentProps,
} from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import { Portal, render } from "solid-js/web"
import type { Bridge, BridgeLayout } from "../sdk/bridge"
import {
  ExtensionContext,
  Live,
  PanelContext,
  type Appearance,
  type Build,
  type ComposerNote,
  type Context,
  type Definition,
  type Embeds,
  type Ipc,
  type IpcClient,
  type Keybinds,
  type Layout,
  type Locale,
  type MountedSession,
  type Mutable,
  type PanelFrame,
  type PanelTab,
  type Router,
  type Servers,
  type SessionRef,
  type SessionScreen,
  type SetupContext,
  type Storage,
  type Workspaces,
} from "../sdk"
import barStyles from "./bar.css?inline"
import type { History } from "./history"
import browserEn from "./i18n/en"
import type definition from "./index"
import { createModel } from "./model"
import SessionBrowserPane from "./panel"
import { BrowserPane, type PaneEvent } from "./ipc"
import { refusal } from "./policy"


type PaneHost = {
  createEmbeds(input: { bridge: Bridge | undefined; zoom: () => number; dialog: () => boolean }): Embeds
  LanguageProvider: Component<{ locale: string; children: JSX.Element }>
  UiI18nBridge: ParentComponent
  useLanguage(): { t(key: string): string }
}

type PaneFixtureState = {
  session: string
  mounted: boolean
  visible: boolean
  url: string | undefined
  loading: boolean
  generation: number
  delayNavigation: boolean
  pendingURL: string | undefined
  loadErrors: Record<string, string | undefined>
  error: string | undefined
  layouts: Record<string, BridgeLayout | undefined>
  covered: boolean
  captures: number
  holdCapture: boolean
  picker: Record<string, boolean | undefined>
  highlights: { sessionKey: string; ref?: Browser.Ref }[]
  comments: ComposerNote[]
  
  zoom: number
  
  history: History
  
  external: string[]
  
  cookies: number
}


const icon =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiByeD0iMyIgZmlsbD0iIzNiODJmNiIvPjwvc3ZnPg=="

const visits: History["visits"] = [
  {
    url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements",
    title: "HTML elements reference - HTML | MDN",
    icon,
  },
  {
    url: "https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Colors/Color_format_converter",
    title: "Color format converter - CSS | MDN",
    icon,
  },
  { url: "http://localhost:5173/settings", title: "Settings - Preview" },
  { url: "https://alpha.example/", title: "Alpha" },
]



export function mountBrowserPane(input: PaneHost) {
  const host = document.createElement("main")
  host.dataset.testid = "browser-pane-fixture"
  host.style.cssText = "position:fixed;inset:0;z-index:1000;background:#181818;color:#eee;padding:24px"
  document.body.appendChild(host)

  function Fixture() {
    const language = input.useLanguage()
    const messages = new Map(Object.entries(browserEn))

    const [store, setStore] = createStore<PaneFixtureState>({
      session: "Alpha",
      mounted: true,
      visible: true,
      url: undefined,
      loading: false,
      generation: 0,
      delayNavigation: false,
      pendingURL: undefined,
      loadErrors: {},
      error: undefined,
      layouts: {},
      covered: false,
      captures: 0,
      holdCapture: false,
      picker: {},
      highlights: [],
      comments: [],
      zoom: 1,
      history: { visits: [] },
      external: [],
      cookies: 3,
    })

    
    const held: (() => void)[] = []
    const bindings = new Map<string, string>()
    const listeners = new Set<(value: { binding: string; event: PaneEvent }) => void>()

    const emit = (key: string, event: PaneEvent) => {
      const binding = bindings.get(key)

      if (binding) listeners.forEach((listener) => listener({ binding, event }))
    }

    const tabs = ["Alpha", "Beta"].map((name) => ({
      id: Browser.TabID.make(`tab_${name === "Alpha" ? "11111111" : "22222222"}-1111-1111-1111-111111111111`),
      title: name,
      url: `https://${name.toLowerCase()}.example/`,
      loading: false,
      canGoBack: false,
      canGoForward: false,
      generation: 0,
    }))

    const current = () => tabs.find((tab) => tab.title === store.session) ?? tabs[0]

    const bridge: Pick<Bridge, "embed" | "capture"> = {
      embed: (id, layout) => setStore("layouts", id, layout),
      capture: async () => {
        setStore("captures", (count) => count + 1)

        if (store.holdCapture) await new Promise<void>((resolve) => held.push(resolve))
        const canvas = new OffscreenCanvas(4, 4)
        const paint = canvas.getContext("2d")

        if (paint) {
          paint.fillStyle = "#3b82f6"
          paint.fillRect(0, 0, 4, 4)
        }

        return new Uint8Array(await (await canvas.convertToBlob({ type: "image/jpeg" })).arrayBuffer())
      },
    }

    
    const embeds = input.createEmbeds({ bridge: bridge as Bridge, zoom: () => 1, dialog: () => false })

    const t = (key: string, params?: Readonly<Partial<Record<string, string | number>>>) =>
      (messages.get(key) ?? language.t(key)).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(params?.[name] ?? ""),
      )

    const base = {
      id: "browser",
      keybinds: { keybind: () => [], keys: (bind: string) => bind.split("+") },
      desktop: { zoom: () => 1 },
      embeds,
      t,
      
      plural: (key: string, count: number) => t(`${key}.${count === 1 ? "one" : "other"}`, { count }),
    }

    const panel: PanelFrame = {
      visible: () => store.visible,
      present: () => store.visible,
      placement: () => "side",
      reserve: () => false,
      animate: () => false,
      sidebar: { opened: () => false, width: () => 0, transition: () => false, resize() {}, toggle() {} },
      open: () => [],
    }

    const server = {
      id: "browser-test",
      name: "Local",
      local: true,
      compatible: true,
      data: { on: () => () => undefined },
    }

    const [reads, setReads] = createStore({ directory: 0 })

    
    const views = new Map(
      ["Alpha", "Beta", "Empty"].map((key) => {
        const value = Object.freeze({
          key,
          id: key,
          server,
          pending: false,
          location: { directory: "/repo" },
          get directory() {
            setReads("directory", (count) => count + 1)

            return "/repo"
          },
        })

        
        
        return [key, value as unknown as MountedSession] as const
      }),
    )

    const session = () => views.get(store.session) ?? views.get("Alpha")

    
    
    
    const screen = {
      file: { search: async () => [] },
      composer: { attach: (note: ComposerNote) => setStore("comments", (items) => [...items, note]) },
    } as unknown as SessionScreen

    const report = (key = store.session) => {
      const tab = tabs.find((item) => item.title === key)

      if (!tab) return
      emit(key, {
        type: "state",
        state: {
          tabs: [
            {
              ...tab,
              url: store.url ?? tab.url,
              loading: store.loading,
              generation: store.generation,
              loadError: store.loadErrors[key],
            },
          ],
          focusedTabID: tab.id,
        },
        error: store.error,
      })
    }

    
    const pane: PaneClient = {
      register: async (value) => {
        bindings.set(value.session, value.binding)
        queueMicrotask(() => {
          report(value.session)
          const tab = tabs.find((item) => item.title === value.session)

          if (tab) emit(value.session, { type: "embed", tabID: tab.id, embed: `embed-${tab.title}` })
        })
      },
      load: async () => undefined,
      command: async (value) => {
        const command = value.command
        
        const reason = command.type === "navigate" ? refusal(command.url) : undefined

        if (reason) throw new Error(reason)
        setStore("error", undefined)

        if (command.type === "navigate" || command.type === "reload") setStore("loadErrors", store.session, undefined)

        if (command.type === "navigate") {
          if (store.delayNavigation) {
            setStore("pendingURL", command.url)

            return
          }

          setStore({ url: command.url, loading: false, generation: store.generation + 1 })
        }

        if (command.type === "stop") setStore("loading", false)
        report()
      },
      
      inspect: async (value) => {
        const key = Array.from(bindings).find((item) => item[1] === value.binding)?.[0]

        if (!key) throw new Error("Unknown picker binding")
        setStore("picker", key, value.enabled)
        emit(key, { type: "inspect", tabID: value.tabID, active: value.enabled })
      },
      highlight: async (value) => {
        const key = Array.from(bindings).find((item) => item[1] === value.binding)?.[0]

        if (!key) throw new Error("Unknown highlight binding")
        setStore("highlights", (items) => [...items, { sessionKey: key, ref: value.ref }])
      },
      
      zoom: async (value) => {
        const steps = [0.9, 1, 1.1, 1.25]
        const index = steps.indexOf(store.zoom)
        const next = value.zoom === "reset" ? 1 : (steps[index + (value.zoom === "in" ? 1 : -1)] ?? store.zoom)
        setStore("zoom", next)
        emit(store.session, { type: "page", tabID: value.tabID, zoom: next })
      },
      site: async () => ({ cookies: store.cookies }),
      
      clearSite: async () => {
        setStore({ cookies: 0, generation: store.generation + 1 })
        report()
      },
      close: async () => undefined,
      state: () => undefined,
      on: (_name, listener) => {
        
        const added = listener as (value: { binding: string; event: PaneEvent }) => void
        listeners.add(added)

        return () => void listeners.delete(added)
      },
    }

    const live = Live.accessor(() => ({ status: "active", generation: 1, value: pane }))

    const fake = {
      ...base,
      uses: { pane: { load: () => live } },
      sessions: { current: session, list: () => Array.from(views.values()).filter((view) => view.key !== "Empty") },
      screen: { current: () => screen },
      layout: { narrow: () => false, stored: () => [], state: () => "visible", open() {}, close() {} },
      links: { open() {} },
      stores: {
        history: {
          get value() {
            return store.history
          },
          set: (next: History) => setStore("history", reconcile(next)),
        },
      },
      system: {
        copy: async () => undefined,
        openExternal: (url: string) => setStore("external", (items) => [...items, url]),
      },
    }

    
    
    const extension = fake as unknown as Context & SetupContext<typeof definition>
    const model = createModel(extension)

    const pick = () => {
      setStore("picker", store.session, false)
      emit(store.session, {
        type: "inspect",
        tabID: current().id,
        active: false,
        element: {
          ref: Browser.Ref.make("e7"),
          selector: "main > button.primary",
          label: "button.primary",
          role: "button",
          name: "Save changes",
          rect: { x: 48, y: 40, width: 160, height: 36 },
        },
      })
    }

    return (
      <ExtensionContext.Provider value={extension}>
        <PanelContext.Provider value={panel}>
          {}
          <style>{`${barStyles}\n[data-popper-positioner] { z-index: 1001 !important; }`}</style>
          <h1 style={{ "font-size": "24px", "margin-bottom": "16px" }}>Browser pane lifecycle</h1>
          <nav style={{ display: "flex", "flex-wrap": "wrap", gap: "12px", margin: "16px 0" }}>
            <For each={["Alpha", "Beta", "Empty"]}>
              {(name) => <button onClick={() => setStore({ session: name, mounted: name !== "Empty" })}>{name}</button>}
            </For>
            <button onClick={() => setStore("mounted", false)}>Unmount pane</button>
            <button
              onClick={() => {
                setStore({ url: "about:blank", loading: false })
                report()
              }}
            >
              Blank page
            </button>
            <button
              onClick={() => {
                setStore({ url: "about:blank", loading: true })
                report()
              }}
            >
              Loading page
            </button>
            <button
              onClick={() => {
                setStore({
                  loading: true,
                  generation: store.generation + 1,
                  loadErrors: { [store.session]: undefined },
                })
                report()
              }}
            >
              Load current page
            </button>
            <button
              onClick={() => {
                setStore("loadErrors", store.session, "ERR_CONNECTION_REFUSED")
                report()
              }}
            >
              Failed page
            </button>
            <button onClick={() => setStore("delayNavigation", true)}>Delay navigation</button>
            <button
              onClick={() => {
                setStore({ error: "browser.address.web", pendingURL: undefined })
                report()
              }}
            >
              Block navigation
            </button>
            <button
              onClick={() => {
                setStore({
                  url: store.pendingURL,
                  pendingURL: undefined,
                  loading: false,
                  generation: store.generation + 1,
                })
                report()
              }}
            >
              Complete navigation
            </button>
            <button onClick={() => setStore("visible", (visible) => !visible)}>Toggle Review tab</button>
            <button onClick={() => setStore("holdCapture", true)}>Hold capture</button>
            <button onClick={() => held.splice(0).forEach((resolve) => resolve())}>Release capture</button>
            <button onClick={() => setStore("covered", (covered) => !covered)}>Toggle popover</button>
            <button onClick={pick}>Pick element</button>
            <button onClick={() => setStore("history", { visits })}>Seed history</button>
            <button onClick={() => emit(store.session, { type: "page", tabID: current().id, icon, zoom: store.zoom })}>
              Page icon
            </button>
            <button onClick={() => emit(store.session, { type: "address", tabID: current().id })}>
              Address shortcut
            </button>
          </nav>
          <p>Captures: {store.captures}</p>
          <p>Zoom: {Math.round(store.zoom * 100)}</p>
          <p>Visits: {store.history.visits.map((visit) => visit.url).join(" ")}</p>
          <p>External: {store.external.join(" ")}</p>
          <p>Session getter reads: {reads.directory}</p>
          <p>Picker: {store.picker[store.session] ? "on" : "off"}</p>
          <For each={tabs}>
            {(tab) => (
              <p>
                Picker {tab.title}: {store.picker[tab.title] ? "on" : "off"}
              </p>
            )}
          </For>
          <p>Highlights: {store.highlights.map((item) => item.ref ?? "clear").join(",")}</p>
          <p>Highlight owners: {store.highlights.map((item) => item.sessionKey).join(",")}</p>
          <div style={{ position: "relative", width: "640px", height: "360px", border: "1px solid #555" }}>
            <Show when={store.mounted && session()}>
              {(view) => <SessionBrowserPane tab={() => current()} session={view()} screen={screen} model={model} />}
            </Show>
          </div>
          <ul data-testid="fixture-comments">
            <For each={store.comments}>
              {(note) => (
                <li>
                  {note.label} {note.live?.href?.includes("#") ? `@${note.live.href.split("#")[1]}` : "(no ref)"}:{" "}
                  {note.comment}
                </li>
              )}
            </For>
          </ul>
          <Show when={store.covered}>
            {}
            <Portal mount={document.body}>
              <div
                data-popper-positioner
                style={{
                  position: "fixed",
                  top: "0",
                  left: "0",
                  width: "320px",
                  height: "480px",
                  "z-index": "1001",
                  "pointer-events": "none",
                }}
              />
            </Portal>
          </Show>
          <For each={tabs}>
            {(tab) => (
              <div
                data-testid={`native-${tab.title}`}
                data-visible={!!store.layouts[`embed-${tab.title}`]?.visible}
                style={{ padding: "12px", margin: "8px 0", border: "1px solid #555" }}
              >
                {tab.title}: {store.layouts[`embed-${tab.title}`]?.visible ? "visible" : "hidden"}
              </div>
            )}
          </For>
        </PanelContext.Provider>
      </ExtensionContext.Provider>
    )
  }

  return render(
    () => (
      <input.LanguageProvider locale="en">
        <input.UiI18nBridge>
          <Fixture />
        </input.UiI18nBridge>
      </input.LanguageProvider>
    ),
    host,
  )
}

type StripTabs = {
  all(): string[]
  active(): string | undefined
  setAll(all: string[]): void
  setActive(tab: string | undefined): void
  close(tab: string): void
  remap(rewrite: (tab: string) => string): void
}

type PaneClient = IpcClient<(typeof BrowserPane)["spec"]>


type RegionHost = {
  LanguageProvider: Component<{ locale: string; children: JSX.Element }>
  ExtensionHostProvider: Component<
    ParentProps<{
      definitions: readonly Definition[]
      disabled: Accessor<ReadonlySet<string> | undefined>
      
      apis: { readonly [api: string]: (extension: string) => object | undefined }
      
      whenMounted: (run: () => void) => () => void
      ipc: (token: Ipc) => PaneClient | undefined
    }>
  >
  useExtensionHost(): { ready(): boolean }
  createRegion(input: {
    region: "side"
    view: Accessor<MountedSession>
    screen: SessionScreen
    tabs: Accessor<StripTabs>
  }): {
    keys(): readonly string[]
    active(): string | undefined
    entry(key: string): { readonly tab: PanelTab } | undefined
  }
  
  definitions: readonly Definition[]
}

type RegionFixtureState = {
  session: string
  strips: Record<string, { all: string[]; active?: string }>
  
  registrations: { binding: string; session: string; restore: number }[]
  
  away: boolean
}




export function mountBrowserRegion(input: RegionHost) {
  const host = document.createElement("main")
  host.dataset.testid = "browser-region-fixture"
  host.style.cssText = "position:fixed;inset:0;z-index:1000;background:#181818;color:#eee;padding:24px"
  document.body.appendChild(host)

  function Fixture() {
    const alpha = "browser-test\nses_alpha"
    const beta = "browser-test\nses_beta"
    const tabID = Browser.TabID.make("tab_33333333-3333-3333-3333-333333333333")

    const [store, setStore] = createStore<RegionFixtureState>({
      session: alpha,
      strips: {
        [alpha]: { all: ["file://alpha.ts"], active: "file://alpha.ts" },
        [beta]: { all: ["file://beta.ts", `browser:${tabID}`], active: `browser:${tabID}` },
      },
      registrations: [],
      away: false,
    })

    
    const [tree, setTree] = createSignal<object>()
    const strip = (session: string) => store.strips[session] ?? { all: [] }
    const setAll = (session: string, all: string[]) => setStore("strips", session, "all", all)

    const close = (session: string, key: string) =>
      batch(() => {
        setAll(
          session,
          strip(session).all.filter((item) => item !== key),
        )

        if (strip(session).active === key) setStore("strips", session, "active", undefined)
      })

    const server = {
      id: "browser-test",
      name: "Browser test",
      url: "http://127.0.0.1:4096",
      data: { on: () => () => undefined },
      local: true,
      builtin: true,
      compatible: true,
      connected: true,
    }

    const location = { directory: "/repo" }

    const refs = [alpha, beta].map(
      
      
      (key) => ({ key, id: key.split("\n")[1], tab: key, server, pending: false, location }) as unknown as SessionRef,
    )

    
    const file = {
      root: "/repo",
      ready: () => false,
      resolve: (path: string) => path.replace(/^file:\/\//, ""),
      absolute: () => false,
      get: () => undefined,
      missing: () => false,
      sync: async () => undefined,
      exists: async () => true,
      search: async () => [],
    }

    
    const views = new Map(
      [alpha, beta].map((key) => {
        const routed = {
          key,
          id: key.split("\n")[1],
          tab: key,
          visit: {},
          server,
          pending: false,
          location,
          directory: "/repo",
          local: true,
          background: [],
        }

        
        
        return [key, routed as unknown as MountedSession] as const
      }),
    )

    const fallback = views.get(alpha)

    if (!fallback) throw new Error("The fixture has no Alpha session")

    const view = () => views.get(store.session) ?? fallback

    
    
    
    
    const screen = { file } as unknown as SessionScreen

    const layout = (extension: string): Layout => ({
      narrow: () => false,
      ready: () => true,
      open(key, session, options) {
        if (!strip(session.key).all.includes(key)) setAll(session.key, [...strip(session.key).all, key])

        if (options?.tab !== "append") setStore("strips", session.key, "active", key)
      },
      close: (key, session) => close(session.key, key),
      toggle() {},
      state(key, session) {
        if (strip(session.key).active === key) return "visible"

        return strip(session.key).all.includes(key) ? "open" : "closed"
      },
      stored: (session) =>
        strip(session.key).all.flatMap((key) =>
          key.startsWith(`${extension}:`) ? [key.slice(extension.length + 1)] : [],
        ),
      side: { opened: () => true, toggle() {} },
      sidebar: { opened: () => true },
      dock: { opened: () => false, placement: () => "side" },
      scroll: { get: () => undefined, set() {} },
      settings() {},
      project() {},
    })

    const keep = <T extends object>(key: string, initial: T) => {
      const [value, set] = createStore<T>(structuredClone(initial))

      if (key === "file:tree") setTree(() => value)

      return {
        memory: [value, (mutation: (draft: T) => void) => set(produce(mutation))] as const,
        store: {
          value,
          ready: () => true,
          update: (mutate: (draft: Mutable<T>) => undefined) =>
            set(
              produce((draft) => {
                
                const returned = mutate(draft as Mutable<T>)

                if (returned !== undefined) throw new Error("Use set(next) to replace the value.")
              }),
            ),
          set: (next: T) => set(reconcile(next)),
        },
      }
    }

    
    const storage = (extension: string): Storage => ({
      store: (key, options) => keep(`${extension}:${key}`, options.initial).store,
      memory: (key, options) => keep(`${extension}:${key}`, options.initial).memory,
      remove() {},
    })

    const build: Build = { version: "", channel: "dev", platform: "desktop", packaged: false }
    const locale: Locale = { locale: () => "en", direction: () => "ltr", setDirection() {} }
    const appearance: Appearance = { font: () => "monospace" }
    const router: Router = { routing: () => false, path: () => "/" }
    const keybinds: Keybinds = { keybind: () => [], keys: (bind) => bind.split("+"), matches: () => false }
    const servers: Servers = { list: () => [server.id], get: () => undefined }
    const workspaces: Workspaces = { on: () => () => undefined }

    const listeners = new Set<(value: { binding: string; event: PaneEvent }) => void>()

    const pane: PaneClient = {
      register: async (value) => {
        setStore("registrations", (items) => [
          ...items,
          { binding: value.binding, session: value.session, restore: value.restore?.tabs.length ?? 0 },
        ])
      },
      load: async () => undefined,
      command: async () => undefined,
      inspect: async () => undefined,
      highlight: async () => undefined,
      zoom: async () => undefined,
      site: async () => ({ cookies: 0 }),
      clearSite: async () => undefined,
      close: async () => undefined,
      state: () => undefined,
      on: (_name, listener) => {
        
        const added = listener as (value: { binding: string; event: PaneEvent }) => void
        listeners.add(added)

        return () => void listeners.delete(added)
      },
    }

    const apis = {
      build: () => build,
      locale: () => locale,
      appearance: () => appearance,
      router: () => router,
      keybinds: () => keybinds,
      servers: () => servers,
      workspaces: () => workspaces,
      desktop: () => undefined,
      sessions: () => ({ list: () => refs, current: view }),
      screen: () => ({ current: () => screen }),
      layout,
      storage,
    }

    const latest = () => store.registrations.filter((item) => item.session === "ses_beta").at(-1)

    
    const inventory = () => {
      const binding = latest()?.binding

      if (!binding) return

      const tab = {
        id: tabID,
        url: "http://localhost:4173/",
        title: "Preview",
        loading: false,
        canGoBack: false,
        canGoForward: false,
        generation: 0,
      }

      listeners.forEach((listener) =>
        listener({ binding, event: { type: "state", state: { tabs: [tab], focusedTabID: tabID } } }),
      )
    }

    
    function Strip() {
      const region = input.createRegion({
        region: "side",
        view,
        screen,
        tabs: () => ({
          all: () => strip(view().key).all,
          active: () => strip(view().key).active,
          setAll: (all) => setAll(view().key, all),
          setActive: (tab) => setStore("strips", view().key, "active", tab),
          close: (tab) => close(view().key, tab),
          remap(rewrite) {
            const all = strip(view().key).all
            const next = Array.from(new Set(all.map(rewrite)))

            if (next.length !== all.length || next.some((key, index) => key !== all[index])) setAll(view().key, next)
          },
        }),
      })

      return (
        <>
          {}
          <div role="tablist" aria-label="Side panel" style={{ display: "flex", gap: "8px", margin: "16px 0" }}>
            <For each={region.keys()}>
              {(key) => (
                <span role="tab" aria-selected={region.active() === key} style={{ padding: "4px 8px" }}>
                  {region.entry(key)?.tab.title}
                </span>
              )}
            </For>
          </div>
          <p data-testid="selected">{region.active() ?? "none"}</p>
        </>
      )
    }

    function Ready(props: ParentProps) {
      const extensions = input.useExtensionHost()

      return <Show when={extensions.ready()}>{props.children}</Show>
    }

    return (
      <DialogProvider>
        <input.ExtensionHostProvider
          definitions={input.definitions}
          disabled={() => new Set<string>()}
          apis={apis}
          whenMounted={(run) => {
            run()

            return () => undefined
          }}
          ipc={(token) => (token.id === BrowserPane.id && !store.away ? pane : undefined)}
        >
          <h1 style={{ "font-size": "24px", "margin-bottom": "16px" }}>Restored side strip</h1>
          <nav style={{ display: "flex", gap: "12px", margin: "16px 0" }}>
            <button onClick={() => setStore("session", beta)}>Beta</button>
            <button onClick={inventory}>First inventory</button>
            <button onClick={() => setStore("away", true)}>Pane away</button>
            <button onClick={() => setStore("away", false)}>Pane back</button>
          </nav>
          <p>Registrations: {store.registrations.length}</p>
          <p>Beta restores: {latest()?.restore ?? 0}</p>
          <p data-testid="tree">{JSON.stringify(tree())}</p>
          <Ready>
            <Strip />
          </Ready>
        </input.ExtensionHostProvider>
      </DialogProvider>
    )
  }

  return render(
    () => (
      <input.LanguageProvider locale="en">
        <Fixture />
      </input.LanguageProvider>
    ),
    host,
  )
}

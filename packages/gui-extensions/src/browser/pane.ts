import { NodeHttpClient } from "@effect/platform-node"
import { Browser } from "@chassis/plugin-browser/rpc"
import { Chassis } from "@chassis/client/effect"
import { SessionID } from "@chassis/schema/session-id"
import electron, { type BrowserWindow } from "electron"
import { Deferred, Effect, ManagedRuntime, Queue, Schedule, Schema, Stream } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"
import type { Embeds, Persisted, ServerEndpoints, Storage, Windows } from "../sdk/main"
import { createBrowserPage, type BrowserPage, type Shared } from "./chromium"
import { browserFailure } from "./errors"
import { createBrowserNetwork, type BrowserNetwork } from "./network"
import { destinationOrigin, fileURLWithin, refusal } from "./policy"
import { createRefs } from "./refs"
import type { PaneEvent } from "./ipc"
import { createBrowserRestoreStore } from "./restore"

type Target = { readonly server: string; readonly session: string; readonly restore?: Browser.State }

type Entry = {
  binding: string
  window: number
  win: BrowserWindow
  abort: AbortController
  registered: ReturnType<typeof Promise.withResolvers<void>>
  requests: Map<string, { abort: AbortController; tabID?: Browser.TabID }>
  report?: (event: PaneEvent) => void
  cleanup?: () => void
  pages: Map<Browser.TabID, BrowserPage>
  tabs: Map<Browser.TabID, Browser.Tab>
  focusedTabID: Browser.TabID | null
  partition: string
  lastState?: string
  network?: BrowserNetwork
  storageKey: string
  
  fileRoots: string[]
}

export type Pane = ReturnType<typeof createBrowserPane>

export function createBrowserPane(input: {
  readonly windows: Windows
  readonly serverEndpoints: ServerEndpoints
  readonly storage: Storage
  
  readonly refs: Persisted<number, number>
  readonly embeds: Embeds
  readonly emit: (window: number, value: { readonly binding: string; readonly event: PaneEvent }) => void
}) {
  const entries = new Map<string, Entry>()
  const restore = createBrowserRestoreStore(input.storage)
  const shared: Shared = { ref: createRefs(input.refs) }
  
  
  const releasing = new Set<Promise<void>>()
  
  const runtime = ManagedRuntime.make(NodeHttpClient.layerNodeHttp)
  let disposed = false

  return {
    async register(window: number, binding: string, target: Target) {
      const server = input.serverEndpoints.get(target.server)

      if (disposed || !server || !destinationOrigin(server.url)) throw new Error("browser.pane.registration.invalid")

      if (server.username && !server.password) throw new Error("browser.pane.endpoint.invalid")
      const win = input.windows.get(window)

      if (!win || entries.has(binding)) throw new Error("browser.pane.owner.invalid")

      if (win.isDestroyed() || win.webContents.isDestroyed()) throw new Error("browser.pane.owner.unavailable")
      const sessionID = SessionID.make(target.session)
      const storageKey = `${target.server}\n${sessionID}`
      const saved = restore.load(storageKey)

      const previous = target.restore ?? {
        tabs: saved.tabs.map((tab) => ({
          ...tab,
          title: "",
          generation: 0,
        })),
        focusedTabID: saved.focusedTabID,
      }

      const entry: Entry = {
        binding,
        window,
        win,
        abort: new AbortController(),
        registered: Promise.withResolvers(),
        requests: new Map(),
        pages: new Map(),
        tabs: new Map(
          previous.tabs.map((tab) => [
            tab.id,
            {
              ...tab,
              loading: false,
              canGoBack: false,
              canGoForward: false,
              generation: tab.generation + 1,
            },
          ]),
        ),
        focusedTabID: previous.focusedTabID,
        partition: `chassis-browser-${crypto.randomUUID()}`,
        storageKey,
        fileRoots: [],
      }

      
      
      electron.session
        .fromPartition(entry.partition)
        .webRequest.onBeforeRequest({ urls: ["file://*/*"] }, (details, callback) =>
          callback({ cancel: !fileURLWithin(details.url, entry.fileRoots) }),
        )
      
      let reason: "browser.pane.unsupported" | "browser.pane.replaced" | "browser.pane.suspended" | undefined
      let attached = false
      const stop = () => close(entry, reason)

      const navigate = (event: Electron.Event<{ isMainFrame: boolean; isSameDocument: boolean }>) => {
        if (event.isMainFrame && !event.isSameDocument) stop()
      }

      win.webContents.once("destroyed", stop)
      win.webContents.on("did-start-navigation", navigate)
      entry.cleanup = () => {
        if (win.isDestroyed()) return
        win.webContents.off("destroyed", stop)
        win.webContents.off("did-start-navigation", navigate)
      }

      entries.set(binding, entry)
      void runtime
        .runPromise(
          Effect.gen(function* () {
            const http = yield* HttpClient.HttpClient

            
            
            const client = yield* Chassis.make({ baseUrl: server.url }).pipe(
              Effect.provideService(
                HttpClient.HttpClient,
                Object.keys(server.headers).length
                  ? HttpClient.mapRequest(http, HttpClientRequest.setHeaders(server.headers))
                  : http,
              ),
            )

            const session = yield* client.session.get({ sessionID })

            
            if (server.local) entry.fileRoots = [session.location.directory]

            const options = {
              location: { directory: session.location.directory, workspace: session.location.workspaceID },
            }

            const attachment = { sessionID, connectionID: crypto.randomUUID() }
            const rpc = client.rpc(Browser.Definition)
            entry.network = yield* createBrowserNetwork({
              rpc,
              attachment,
              location: options.location,
              partition: entry.partition,
            })
            const connected = yield* Deferred.make<void>()
            const outbound = yield* Queue.unbounded<Effect.Effect<void>>()

            
            
            const send = (effect: Effect.Effect<unknown, unknown>) =>
              Queue.offerUnsafe(
                outbound,
                effect.pipe(Effect.catchCause((cause) => Effect.logWarning("Browser send failed", cause))),
              )

            const reply = (requestID: string, outcome: Browser.Outcome) =>
              send(
                rpc.result({ ...attachment, requestID, outcome: Schema.encodeSync(Browser.Outcome)(outcome) }, options),
              )

            
            
            
            
            entry.report = (event) => {
              const local = Effect.sync(() => publish(entry, event))

              if (event.type !== "state") return send(local)
              send(
                rpc.state({ ...attachment, state: event.state ?? { tabs: [], focusedTabID: null } }, options).pipe(
                  Effect.retry({
                    while: (error) => !("type" in error && error.type === "unavailable"),
                    schedule: Schedule.min([Schedule.exponential("250 millis"), Schedule.spaced("10 seconds")]),
                  }),
                  Effect.ensuring(local),
                ),
              )
            }

            const receive = client.event.subscribe().pipe(
              Stream.runForEach((event) =>
                Effect.gen(function* () {
                  if (event.type === "server.connected") {
                    yield* Deferred.succeed(connected, undefined)

                    return
                  }

                  if (
                    event.type !== "rpc.experimental.browser.control" ||
                    event.data.connectionID !== attachment.connectionID
                  )
                    return

                  const message = yield* Schema.decodeUnknownEffect(Browser.Control)(event.data).pipe(
                    Effect.tapError(() =>
                      Effect.sync(() => {
                        reason = "browser.pane.unsupported"
                      }),
                    ),
                  )

                  if (message.type === "attached") {
                    attached = true

                    return entry.registered.resolve()
                  }

                  if (message.type === "cancel") return entry.requests.get(message.requestID)?.abort.abort()
                  const abort = new AbortController()
                  entry.requests.set(message.requestID, { abort })
                  yield* rpc.command({ ...attachment, requestID: message.requestID }, options).pipe(
                    Effect.flatMap((command) =>
                      Effect.promise(async () => {
                        entry.requests.set(
                          message.requestID,
                          "tabID" in command.action ? { abort, tabID: command.action.tabID } : { abort },
                        )
                        reply(
                          message.requestID,
                          await execute(entry, command, abort.signal).then(
                            (result) => ({ type: "success" as const, result }),
                            (cause: unknown) => browserFailure(command.action, cause),
                          ),
                        )
                      }),
                    ),
                    Effect.ensuring(Effect.sync(() => entry.requests.delete(message.requestID))),
                    
                    
                    Effect.tapError((error) =>
                      Effect.sync(() => {
                        if (!Schema.isSchemaError(error)) return
                        reply(message.requestID, {
                          type: "failure",
                          code: "unsupported",
                          message:
                            "This desktop app does not support the requested browser operation. Ask the user to update the desktop app, or use another operation.",
                        })
                      }),
                    ),
                    
                    
                    Effect.catchCause((cause) =>
                      abort.signal.aborted ? Effect.void : Effect.logWarning("Browser command failed", cause),
                    ),
                    Effect.forkScoped,
                  )
                }),
              ),
            )

            yield* Effect.raceAllFirst([
              receive,
              Stream.fromQueue(outbound).pipe(Stream.runForEach((send) => send)),
              Deferred.await(connected).pipe(
                Effect.andThen(rpc.attach({ ...attachment, version: 4 }, options)),
                Effect.tap((result) =>
                  Effect.sync(() => {
                    if (result === "replaced") reason = "browser.pane.replaced"
                  }),
                ),
              ),
            ])
          }).pipe(
            Effect.scoped,
            Effect.tapError((error) =>
              Effect.sync(() => {
                const type = error instanceof Object && "type" in error ? error.type : undefined

                if (type === "rpc.unavailable" && attached) {
                  reason = "browser.pane.suspended"

                  return
                }

                if (type === "rpc.unavailable" || type === "rpc.method_not_found" || type === "rpc.invalid_input")
                  reason = "browser.pane.unsupported"
              }),
            ),
            Effect.ensuring(Effect.sync(stop)),
          ),
          { signal: entry.abort.signal },
        )
        .catch(stop)
      const timeout = setTimeout(stop, 15_000)
      await entry.registered.promise.finally(() => clearTimeout(timeout))

      if (entries.get(binding) !== entry) throw new Error("browser.pane.registration.closed")
      publishState(entry)
    },
    load(window: number, binding: string, tabID: Browser.TabID) {
      load(owned(window, binding), tabID)
    },
    async inspect(window: number, binding: string, tabID: Browser.TabID, enabled: boolean) {
      await owned(window, binding).pages.get(tabID)?.inspect(enabled)
    },
    async highlight(window: number, binding: string, tabID: Browser.TabID, ref?: Browser.Ref) {
      await owned(window, binding).pages.get(tabID)?.highlight(ref)
    },
    zoom(window: number, binding: string, tabID: Browser.TabID, direction: "in" | "out" | "reset") {
      owned(window, binding).pages.get(tabID)?.zoom(direction)
    },
    async site(window: number, binding: string, tabID: Browser.TabID) {
      return (await owned(window, binding).pages.get(tabID)?.site()) ?? { cookies: 0 }
    },
    async clearSite(window: number, binding: string, tabID: Browser.TabID) {
      await owned(window, binding).pages.get(tabID)?.clearSite()
    },
    async command(window: number, binding: string, command: Browser.Action) {
      const entry = owned(window, binding)
      const url = command.type === "navigate" || command.type === "tabs.open" ? command.url : undefined
      
      const reason = url === undefined ? undefined : refusal(url, { fileRoots: entry.fileRoots })

      if (reason) throw new Error(reason)
      await execute(entry, { action: command, files: [] }, new AbortController().signal)
    },
    async close(window: number, binding: string) {
      const entry = owned(window, binding)
      restore.remove(entry.storageKey)
      close(entry)
    },
    
    async dispose() {
      disposed = true
      entries.forEach((entry) => close(entry, "browser.pane.suspended"))
      await Promise.all(releasing)
      await runtime.dispose()
    },
  }

  function owned(window: number, binding: string) {
    const entry = entries.get(binding)

    if (!entry || entry.window !== window) throw new Error("browser.pane.unavailable")

    return entry
  }

  function publish(entry: Entry, event: PaneEvent) {
    if (!entries.has(entry.binding) || entry.win.isDestroyed() || entry.win.webContents.isDestroyed()) return
    input.emit(entry.window, { binding: entry.binding, event })
  }

  function close(entry: Entry, reason = "browser.pane.registration.closed") {
    if (entries.get(entry.binding) !== entry) return
    entry.report = undefined
    entry.requests.forEach((request) => request.abort.abort())
    entry.requests.clear()
    const suspended = reason === "browser.pane.suspended"

    if (suspended) publishState(entry, reason)
    entry.pages.forEach((page) => void release(page).catch(() => undefined))
    entry.pages.clear()
    entry.tabs.clear()
    entry.focusedTabID = null

    if (!suspended) publishState(entry, reason)
    entries.delete(entry.binding)
    entry.registered.reject(new Error("browser.pane.registration.closed"))
    entry.cleanup?.()
    entry.abort.abort()
  }

  async function closePage(entry: Entry, tabID: Browser.TabID, error?: string) {
    const page = entry.pages.get(tabID)

    if (!entry.tabs.has(tabID))
      throw new Error(
        "This tab is no longer available. Call browser.tabs.list({}) and use an existing tabID from this session.",
      )
    const focused = entry.focusedTabID === tabID
    entry.requests.forEach((request) => {
      if (request.tabID === tabID) request.abort.abort()
    })
    entry.pages.delete(tabID)
    entry.tabs.delete(tabID)

    if (focused) entry.focusedTabID = entry.tabs.keys().next().value ?? null

    if (page) await release(page)
    publishState(entry, error)
  }

  function release(page: BrowserPage) {
    const done = page.dispose()
    const settled = done.catch(() => undefined)
    releasing.add(settled)
    void settled.finally(() => releasing.delete(settled))

    return done
  }

  function publishState(entry: Entry, error?: string) {
    const current = { type: "state" as const, state: inventory(entry) }
    const event = error === undefined ? current : { ...current, error }

    
    if (entry.report)
      restore.save(entry.storageKey, {
        tabs: event.state.tabs.map((tab) => ({
          id: tab.id,
          
          url: tab.url || entry.tabs.get(tab.id)?.url || "about:blank",
        })),
        focusedTabID: entry.focusedTabID,
      })
    const next = JSON.stringify(event)

    if (entry.lastState === next) return
    entry.lastState = next
    report(entry, event)
  }

  function report(entry: Entry, event: PaneEvent) {
    if (entry.report) return entry.report(event)
    publish(entry, event)
  }

  function inventory(entry: Entry): Browser.State {
    return {
      tabs: Array.from(entry.tabs, ([id, tab]) => entry.pages.get(id)?.state() ?? tab),
      focusedTabID: entry.focusedTabID,
    }
  }

  function load(entry: Entry, tabID: Browser.TabID) {
    const page = entry.pages.get(tabID)

    if (page) return page
    const tab = entry.tabs.get(tabID)

    return tab ? create(entry, true, undefined, tab) : undefined
  }

  function create(
    entry: Entry,
    initialize = true,
    popupOptions?: Electron.BrowserWindowConstructorOptions,
    restore?: Browser.Tab,
  ) {
    if (!entry.network) throw new Error("Browser network is not ready; no tab was opened.")
    const id = restore?.id ?? Browser.TabID.make(`tab_${crypto.randomUUID()}`)

    const fail = () => {
      if (entry.pages.has(id)) void closePage(entry, id, "page_crashed").catch(() => undefined)
    }

    const page = createBrowserPage(entry.win, {
      id,
      partition: entry.partition,
      network: entry.network,
      initialize,
      restore,
      popupOptions,
      fileRoots: () => entry.fileRoots,
      shared,
      embeds: input.embeds,
      fail,
      publish: (error) => {
        if (entry.pages.has(id)) publishState(entry, error)
      },
      inspect: (event) => {
        if (entry.pages.has(id)) report(entry, { type: "inspect", tabID: id, ...event })
      },
      
      
      detail: (value) => {
        if (entry.pages.has(id)) report(entry, { type: "page", tabID: id, ...value })
      },
      zoomed: () => entry.pages.forEach((page) => page.detail()),
      address: () => {
        if (!entry.pages.has(id) || entry.win.isDestroyed()) return
        
        entry.win.webContents.focus()
        publish(entry, { type: "address", tabID: id })
      },
      popup: (popupOptions, background) => {
        const popup = create(entry, false, popupOptions)

        if (!background) focus(entry, popup.state().id)

        return popup.contents
      },
    })

    entry.pages.set(id, page)
    entry.tabs.set(id, restore ?? page.state())
    
    publish(entry, { type: "embed", tabID: id, embed: page.embed })
    void page.ready
      .then(() => {
        if (entry.pages.get(id) === page) publishState(entry)
      })
      .catch(fail)

    return page
  }

  async function execute(entry: Entry, command: Browser.Command, signal: AbortSignal) {
    const action = command.action

    if (signal.aborted)
      throw new Error(
        "Browser request was cancelled. Do not repeat a mutating action until you have inspected its outcome.",
      )

    if (action.type === "tabs.list") return { value: inventory(entry), files: [] }

    if (action.type === "preview") {
      
      report(entry, { type: "preview", path: action.path })

      return { value: { path: action.path }, files: [] }
    }

    if (action.type === "tabs.open") {
      const page = create(entry)

      if (action.focus !== false) focus(entry, page.state().id)
      await page.ready
      await page.execute(
        { action: { type: "navigate", tabID: page.state().id, url: action.url ?? "about:blank" }, files: [] },
        signal,
      )
      publishState(entry)

      return { value: page.state(), files: [] }
    }

    const tab = inventory(entry).tabs.find((tab) => tab.id === action.tabID)

    if (!tab)
      throw new Error(
        "Browser tab is unavailable. Call browser.tabs.list({}) and use an existing tabID from this session; a closed tab is not replaced automatically.",
      )

    if (action.type === "tabs.focus") {
      focus(entry, action.tabID)

      return { value: tab, files: [] }
    }

    if (action.type === "tabs.close") {
      await closePage(entry, action.tabID)

      return { value: inventory(entry), files: [] }
    }

    const page = entry.pages.get(action.tabID) ?? create(entry, true, undefined, tab)
    await page.ready
    const result = await page.execute(command, signal)
    publishState(entry)

    return result
  }

  function focus(entry: Entry, tabID: Browser.TabID) {
    entry.focusedTabID = tabID
    publishState(entry)
    report(entry, { type: "focus", tabID })
  }
}

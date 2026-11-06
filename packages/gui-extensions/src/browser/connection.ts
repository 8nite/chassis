import type { Browser } from "@chassis/plugin-browser/rpc"
import type { IpcClient } from "../sdk"
import type { BrowserPane, PaneEvent } from "./ipc"

type Client = IpcClient<(typeof BrowserPane)["spec"]>

export type InspectEvent = Extract<PaneEvent, { type: "inspect" }>

export type PageEvent = Extract<PaneEvent, { type: "page" }>

export type Zoom = "in" | "out" | "reset"

export type Connection = ReturnType<typeof createConnection>

export type Registration = {
  
  load(tabID: Browser.TabID): void
  command(command: Browser.Action): Promise<void>
  inspect(tabID: Browser.TabID, enabled: boolean): void
  highlight(tabID: Browser.TabID, ref?: Browser.Ref): void
  zoom(tabID: Browser.TabID, zoom: Zoom): void
  site(tabID: Browser.TabID): Promise<{ cookies: number }>
  clearSite(tabID: Browser.TabID): Promise<void>
  close(): void
}

type ConnectionState = {
  registration?: Registration
  browser: Browser.State | null
  
  embeds: Readonly<Record<string, string>>
  suspended: boolean
  error?: string
}



export function createConnection(input: {
  client: () => Client | undefined
  listen: (binding: string, listener: (event: PaneEvent) => void) => () => void
  target: () => { server: string; session: string }
  
  change: (state: ConnectionState, mirror: () => void, native: boolean) => void
  
  strip: {
    stored: () => readonly string[]
    open: (tabID: Browser.TabID) => void
    close: (tabID: string) => void
  }
  focus: (tabID: Browser.TabID) => void
  preview: (path: string) => void
  inspect: (event: InspectEvent) => void
  
  page: (event: PageEvent) => void
  
  address: (tabID: Browser.TabID) => void
}) {
  const state: ConnectionState = { browser: null, embeds: {}, suspended: false }
  let disposed = false
  let blocked = false
  let attempts = 0
  let retry: ReturnType<typeof setTimeout> | undefined
  
  let lost = false
  
  let known: readonly Browser.TabID[] | undefined
  
  let pruning = false

  
  
  
  
  const mirror = () => {
    const previous = new Set<string>(known ?? [])
    const ids = state.browser?.tabs.map((tab) => tab.id)
    const prune = pruning
    known = ids
    pruning = false

    if (!ids) return

    if (prune) {
      const listed = new Set<string>(ids)
      input.strip
        .stored()
        .filter((tabID) => !listed.has(tabID))
        .forEach((tabID) => input.strip.close(tabID))
    }

    ids.forEach((tabID) => {
      if (!previous.has(tabID)) input.strip.open(tabID)
    })
  }

  const publish = (native = false) => {
    pruning ||= native
    input.change({ ...state }, mirror, native)
  }

  
  
  const suspend = (registration: Registration) => {
    if (disposed || state.registration !== registration) return
    lost = true
    registration.close()
    state.registration = undefined
    state.embeds = {}
    state.suspended = true
    state.error = undefined
    publish()
  }

  
  
  const reopen = (registration: Registration) => {
    if (disposed || state.registration !== registration) return
    registration.close()
    state.registration = undefined
    state.embeds = {}
    state.suspended = false
    state.error = undefined
    publish()
    retry = setTimeout(register, Math.min(30_000, 1_000 * 2 ** attempts++))
  }

  const register = () => {
    if (disposed || blocked || state.registration) return
    const current = input.client()

    if (!current) {
      lost = true

      return
    }

    lost = false
    clearTimeout(retry)

    const registration: Registration = open(
      current,
      input.listen,
      state.browser ? { ...input.target(), restore: state.browser } : input.target(),
      (event) => {
        if (disposed || state.registration !== registration) return

        if (event.type === "focus") return input.focus(event.tabID)

        if (event.type === "preview") return input.preview(event.path)

        if (event.type === "inspect") return input.inspect(event)

        if (event.type === "page") return input.page(event)

        if (event.type === "address") return input.address(event.tabID)

        if (event.type === "embed") {
          state.embeds = { ...state.embeds, [event.tabID]: event.embed }

          return publish()
        }

        if (event.error === "browser.pane.unsupported" || event.error === "browser.pane.replaced") {
          blocked = true
          registration.close()
          state.registration = undefined
          state.embeds = {}
          state.browser = null
          state.error = event.error
          publish()

          return
        }

        if (event.error === "browser.pane.registration.closed") return reopen(registration)

        if (event.error === "browser.pane.suspended") {
          registration.close()
          state.registration = undefined
          state.embeds = {}
          state.suspended = true

          if (event.state) state.browser = event.state
          state.error = undefined
          publish()

          
          return
        }

        if (event.state) attempts = 0
        state.browser = event.state
        state.error = event.error
        publish(true)
      },
      (error) => {
        if (unavailable(error)) return suspend(registration)

        
        if (error instanceof Error && error.message === "browser.pane.registration.closed") return
        reopen(registration)
      },
    )

    state.registration = registration
    state.embeds = {}
    state.suspended = false
    state.error = undefined
    publish()
  }

  return {
    wake: register,
    
    refresh() {
      if (!input.client()) {
        if (state.registration) suspend(state.registration)

        return
      }

      if (lost) register()
    },
    command(command: Browser.Action) {
      register()
      const registration = state.registration

      if (!registration) {
        const error = new Error("browser.pane.unavailable")

        return Promise.reject(input.client() ? error : Object.assign(error, { code: "unavailable" }))
      }

      return registration.command(command).catch((cause: unknown) => {
        if (unavailable(cause)) suspend(registration)
        throw cause
      })
    },
    inspect(tabID: Browser.TabID, enabled: boolean) {
      state.registration?.inspect(tabID, enabled)
    },
    highlight(tabID: Browser.TabID, ref?: Browser.Ref) {
      state.registration?.highlight(tabID, ref)
    },
    zoom(tabID: Browser.TabID, zoom: Zoom) {
      state.registration?.zoom(tabID, zoom)
    },
    
    site: (tabID: Browser.TabID) => state.registration?.site(tabID),
    clearSite: (tabID: Browser.TabID) => state.registration?.clearSite(tabID),
    dispose() {
      disposed = true
      clearTimeout(retry)
      state.registration?.close()
      state.registration = undefined
    },
  }
}

function open(
  client: Client,
  listen: (binding: string, listener: (event: PaneEvent) => void) => () => void,
  target: { server: string; session: string; restore?: Browser.State },
  listener: (event: PaneEvent) => void,
  failed: (cause: unknown) => void,
): Registration {
  const binding = crypto.randomUUID()
  const status = { closed: false }

  const stop = listen(binding, (event) => {
    if (!status.closed) listener(event)
  })

  const ready = client.register({ binding, ...target })
  
  void ready.catch(failed)

  return {
    load(tabID) {
      if (status.closed) return
      void ready.then(() => client.load({ binding, tabID })).catch(() => undefined)
    },
    command: (command) => ready.then(() => client.command({ binding, command })),
    inspect(tabID, enabled) {
      if (status.closed) return
      void ready.then(() => client.inspect({ binding, tabID, enabled })).catch(() => undefined)
    },
    highlight(tabID, ref) {
      if (status.closed) return
      void ready
        .then(() => client.highlight(ref === undefined ? { binding, tabID } : { binding, tabID, ref }))
        .catch(() => undefined)
    },
    zoom(tabID, zoom) {
      if (status.closed) return
      void ready.then(() => client.zoom({ binding, tabID, zoom })).catch(() => undefined)
    },
    site: (tabID) => ready.then(() => client.site({ binding, tabID })),
    clearSite: (tabID) => ready.then(() => client.clearSite({ binding, tabID })),
    close() {
      if (status.closed) return
      status.closed = true
      stop()
      void ready.then(() => client.close({ binding })).catch(() => undefined)
    },
  }
}


export function unavailable(cause: unknown) {
  return cause instanceof Error && "code" in cause && cause.code === "unavailable"
}

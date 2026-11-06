import type { MainSetup } from "../sdk/main"
import type definition from "./index"
import type { Pane } from "./pane"
import { BrowserPane } from "./ipc"


type LoadedPane = { pane?: Promise<Pane> }

const setup: MainSetup<typeof definition> = (ctx) => {
  const loaded: LoadedPane = {}

  
  
  const load = () =>
    (loaded.pane ??= import("./pane").then((module) =>
      module.createBrowserPane({
        windows: ctx.windows,
        serverEndpoints: ctx.serverEndpoints,
        storage: ctx.storage,
        refs: ctx.stores.refs,
        embeds: ctx.embeds,
        emit: (window, value) => provider.emit("event", value, window),
      }),
    ))

  
  const existing = () => loaded.pane ?? Promise.reject(new Error("browser.pane.unavailable"))

  const provider = ctx.provide(BrowserPane, {
    register: async (input, caller) => (await load()).register(caller.window, input.binding, input),
    load: async (input, caller) => (await existing()).load(caller.window, input.binding, input.tabID),
    command: async (input, caller) => (await existing()).command(caller.window, input.binding, input.command),
    inspect: async (input, caller) =>
      (await existing()).inspect(caller.window, input.binding, input.tabID, input.enabled),
    highlight: async (input, caller) =>
      (await existing()).highlight(caller.window, input.binding, input.tabID, input.ref),
    zoom: async (input, caller) => (await existing()).zoom(caller.window, input.binding, input.tabID, input.zoom),
    site: async (input, caller) => (await existing()).site(caller.window, input.binding, input.tabID),
    clearSite: async (input, caller) => (await existing()).clearSite(caller.window, input.binding, input.tabID),
    close: async (input, caller) => (await existing()).close(caller.window, input.binding),
  })

  
  ctx.scope.addFinalizer(async () => {
    if (loaded.pane) await (await loaded.pane).dispose()
  })
}

export default setup

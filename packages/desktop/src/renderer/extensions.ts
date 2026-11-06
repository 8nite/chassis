import { Predicate } from "effect"
import type { Bridge, BridgeMessage } from "@chassis/gui-extensions/sdk/bridge"
import type { ExtensionFailure } from "../shared/ipc-rpc/extensions"
import { api } from "./api"
import { cancellable, invoke, listen, send } from "./ipc-client"


type Attachment = { stop?: () => void }


export function createExtensionBridge(): Bridge {
  const listeners = new Set<(message: BridgeMessage) => void>()
  const dispatch = (message: BridgeMessage) => listeners.forEach((listener) => listener(message))
  const attached: Attachment = {}
  
  const menubar = { revision: 0 }

  const attach = () => {
    const stops = [
      listen("ExtensionState", (event) => dispatch({ type: "state", ipc: event.ipc, state: event.state })),
      listen("ExtensionEvent", (event) =>
        dispatch({ type: "event", ipc: event.ipc, name: event.name, data: event.data }),
      ),
      listen("ExtensionAvailable", (event) =>
        dispatch({ type: "available", ipc: event.ipc, available: event.available }),
      ),
      listen("ExtensionsChanged", (event) => dispatch({ type: "extensions", list: event.list })),
      listen("ExtensionMenubarItemsChanged", (event) => {
        menubar.revision++
        dispatch({ type: "menubarItems", items: event.items })
      }),
    ]

    const revision = menubar.revision
    void invoke("ExtensionMenubarItems").then((items) => {
      if (attached.stop && menubar.revision === revision) dispatch({ type: "menubarItems", items })
    })

    return () => stops.forEach((stop) => stop())
  }

  return {
    packaged: api.getWindowBootstrap().packaged ?? false,
    call: (input, signal) =>
      cancellable("ExtensionCall", input, signal).catch((cause: unknown) => {
        throw failure(cause)
      }),
    subscribe: (ipc) => invoke("ExtensionSubscribe", { ipc }),
    on(listener) {
      listeners.add(listener)
      attached.stop ??= attach()

      return () => {
        listeners.delete(listener)

        if (listeners.size > 0) return
        attached.stop?.()
        attached.stop = undefined
      }
    },
    embed: (id, layout) => send("ExtensionEmbed", { id, layout }),
    capture: (id) => invoke("ExtensionCapture", { id }).then((data) => data ?? undefined),
    runMenubarItem: (id) => send("ExtensionMenubarItem", { id }),
    configure: (servers) => send("ExtensionConfigure", { servers }),
    manager: {
      initial: window.electron.extensions,
      list: () => invoke("ExtensionList"),
      enable: (id) => manage(invoke("ExtensionEnable", { id })),
      disable: (id) => manage(invoke("ExtensionDisable", { id })),
      reload: (id) => manage(invoke("ExtensionReload", { id })),
      install: (source) =>
        manage(invoke("ExtensionInstall", { source: Predicate.isString(source) ? source : new Uint8Array(source) })),
      remove: (id) => manage(invoke("ExtensionRemove", { id })),
      source: (id) => manage(invoke("ExtensionSource", { id })),
      asset: (id, path) =>
        `oc://extensions/${encodeURIComponent(id)}/${path.split("/").map(encodeURIComponent).join("/")}`,
    },
  }
}

function manage<Value>(request: Promise<Value>) {
  return request.catch((cause: unknown) => {
    throw failure(cause)
  })
}


function failure(cause: unknown) {
  if (!isFailure(cause)) return cause

  return Object.assign(new Error(cause.message ?? cause.code), { code: cause.code })
}

function isFailure(error: unknown): error is ExtensionFailure {
  return Predicate.hasProperty(error, "code") && Predicate.isString(error.code)
}

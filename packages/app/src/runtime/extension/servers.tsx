import { createContext, createEffect, createMemo, createSignal, useContext, type ParentProps } from "solid-js"
import { reconcile } from "solid-js/store"
import { Schema } from "effect"
import { MenuItem, Server, type ServerEntry } from "@chassis/gui-extensions/sdk"
import { Persistence } from "@/runtime/persistence/schema"
import { Persist, persisted } from "@/runtime/persistence/storage"
import type { ServerConnection } from "@/runtime/server/registry"
import { useExtensionHost } from "./host"


export type ExtensionServer = { readonly key: string; readonly extension: string; readonly entry: ServerEntry }


const offline = { url: "http://127.0.0.1:0" }


const Inventories = Schema.Record(
  Schema.String,
  Schema.mutableKey(
    Persistence.struct({
      order: Schema.Finite,
      servers: Persistence.array(
        Persistence.struct({
          id: Schema.String,
          name: Schema.String,
          label: Persistence.optional(Schema.String),
          listed: Persistence.optional(Schema.Boolean),
        }),
      ),
    }),
  ),
)

const ServersContext = createContext<ReturnType<typeof createExtensionServers>>()

export function useExtensionServers() {
  const value = useContext(ServersContext)

  if (!value) throw new Error("Extension servers are unavailable")

  return value
}


export function ExtensionServersProvider(props: ParentProps<{ failed: (extension: string) => boolean }>) {
  return (
    <ServersContext.Provider value={createExtensionServers(props.failed)}>{props.children}</ServersContext.Provider>
  )
}

function createExtensionServers(failed: (extension: string) => boolean) {
  const host = useExtensionHost()
  const [known, setKnown, , knownReady] = persisted(Persist.global("extension.servers"), Inventories, {})
  const sources = createMemo(() => host.items(Server).toSorted((a, b) => (a.value.order ?? 0) - (b.value.order ?? 0)))
  
  
  const available = createMemo(() => sources().filter((item) => item.value.ready))
  createEffect(() => {
    if (!knownReady()) return

    for (const item of available()) {
      const inventory = {
        order: item.value.order ?? 0,
        servers: item.value.entries.map((entry) => ({
          id: entry.id,
          name: entry.name,
          label: entry.label,
          listed: entry.listed,
        })),
      }

      if (JSON.stringify(known[item.extension]) !== JSON.stringify(inventory))
        setKnown(item.extension, reconcile(inventory))
    }
  })

  const entries = createMemo(() => {
    const live = available()
    const down = Object.entries(known).filter(([extension]) => !live.some((item) => item.extension === extension))

    return [
      ...live.map((item) => ({ extension: item.extension, order: item.value.order ?? 0, entries: item.value.entries })),
      ...down.map(([extension, inventory]) => ({
        extension,
        order: inventory.order,
        entries: inventory.servers.map((server): ServerEntry => ({ ...server, state: "stopped" })),
      })),
    ]
      .toSorted((a, b) => a.order - b.order)
      .flatMap((group) =>
        group.entries.map(
          (entry): ExtensionServer => ({ key: `${group.extension}:${entry.id}`, extension: group.extension, entry }),
        ),
      )
  })

  
  
  const connections = new Map<
    string,
    { update: (server: ExtensionServer) => void; value: ServerConnection.Extension }
  >()

  const list = createMemo(() => {
    const listed = entries().filter((item) => item.entry.listed !== false)
    const keys = new Set(listed.map((item) => item.key))
    connections.forEach((_, key) => {
      if (!keys.has(key)) connections.delete(key)
    })

    return listed.map((item) => {
      const existing = connections.get(item.key)

      if (existing) {
        existing.update(item)

        return existing.value
      }

      const created = connection(item)
      connections.set(item.key, created)

      return created.value
    })
  })

  
  const ready = createMemo<boolean>(
    (previous) =>
      previous ||
      (knownReady() && host.ready() && sources().every((item) => item.value.ready || failed(item.extension))),
    false,
  )

  return {
    ready,
    
    list,
    
    entries,
    entry: (key: string) => entries().find((item) => item.key === key),
  }
}

function connection(initial: ExtensionServer) {
  const [current, setCurrent] = createSignal(initial)
  const entry = () => current().entry

  const value: ServerConnection.Extension = {
    type: "extension",
    key: initial.key,
    extension: initial.extension,
    get displayName() {
      return entry().name
    },
    get label() {
      return entry().label
    },
    get state() {
      return entry().state
    },
    get connecting() {
      return entry().state === "starting"
    },
    get authenticationRequired() {
      return entry().state === "auth"
    },
    get managed() {
      return !!entry().reconnect
    },
    get http() {
      return entry().http ?? offline
    },
    
    get reconnect() {
      if (!entry().reconnect) return undefined

      return (signal: AbortSignal) => entry().reconnect?.(signal) ?? Promise.resolve(entry().http ?? offline)
    },
    connect: () => entry().connect?.() ?? Promise.resolve(entry().state === "ready"),
  }

  return { update: (server: ExtensionServer) => setCurrent(server), value }
}


export function useServerRowItems(server: () => string) {
  const host = useExtensionHost()

  return createMemo(() =>
    host
      .list(MenuItem)
      .flatMap((item) => (item.menu === "server.row" && (item.when?.(server()) ?? true) ? [item] : []))
      .toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  )
}


export function useServerAddItems() {
  const host = useExtensionHost()

  return createMemo(() =>
    host
      .list(MenuItem)
      .flatMap((item) => (item.menu === "server.add" ? [item] : []))
      .toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  )
}

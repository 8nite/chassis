import { createMemo } from "solid-js"
import { ServerConnection, serverName, useServers } from "@/runtime/server/registry"
import { useExtensionServers, type ExtensionServer } from "@/runtime/extension/servers"
import type { ServerCtx } from "@/runtime/server/runtime"
import { pathKey } from "@/workspaces/path-key"

export function settingsProjects(context: {
  projects: Pick<ServerCtx["projects"], "list" | "closed">
  sync: { data: Pick<ServerCtx["sync"]["data"], "project"> }
}) {
  const tracked = context.projects.list()
  const paths = new Set(tracked.map((project) => pathKey(project.worktree)))
  const closed = new Set(context.projects.closed().map(pathKey))

  return [
    ...tracked,
    
    ...context.sync.data.project
      .filter((project) => !paths.has(pathKey(project.worktree)) && !closed.has(pathKey(project.worktree)))
      .map((project) => ({ ...project, expanded: false })),
  ]
}

export type SettingsServer = {
  key: ServerConnection.Key
  name: string
  connection?: ServerConnection.Any
  
  source?: ExtensionServer
}

export function settingsServers(connections: readonly ServerConnection.Any[], sources: readonly ExtensionServer[]) {
  const byKey = new Map(sources.map((item) => [item.key, item]))
  const connected = new Set<string>(connections.map(ServerConnection.key))

  return [
    ...connections.map((connection): SettingsServer => {
      const key = ServerConnection.key(connection)
      const source = byKey.get(key)

      return {
        key,
        name: source?.entry.name ?? (serverName(connection) || key),
        connection: source && source.entry.state !== "ready" ? undefined : connection,
        source,
      }
    }),
    ...sources
      .filter((item) => !connected.has(item.key))
      .map(
        (item): SettingsServer => ({
          key: ServerConnection.Key.make(item.key),
          name: item.entry.name,
          source: item,
        }),
      ),
  ]
}


export function useSettingsServersLoaded() {
  const servers = useServers()
  const extensions = useExtensionServers()

  return () => servers.hydrated() && extensions.ready()
}

export function useSettingsServers() {
  const servers = useServers()
  const extensions = useExtensionServers()

  return createMemo(() => settingsServers(servers.list, extensions.entries()))
}

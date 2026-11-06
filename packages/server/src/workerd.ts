export * as ServerWorkerd from "./workerd"

import { Effect, Layer } from "effect"
import { ConfigPluginSource } from "@chassis/core/config/plugin/source"
import { Database } from "@chassis/core/database/database"
import { sqliteLayer } from "@chassis/core/database/sqlite.workerd"
import type { DurableObjectStorage } from "@chassis/core/database/sqlite.workerd"
import { EnvironmentUnavailable } from "@chassis/core/environment/unavailable"
import { FileSystem } from "@chassis/core/filesystem"
import { FileSystemSearch } from "@chassis/core/filesystem/search"
import { Pty } from "@chassis/core/pty"
import { Snapshot } from "@chassis/core/snapshot"
import { Vcs } from "@chassis/core/vcs"
import { CrossSpawnSpawner } from "@chassis/util/cross-spawn-spawner"
import type { LayerNode } from "@chassis/util/effect/layer-node"
import { ServerFetch } from "./fetch"
import type { ServerOptions } from "./options"


export interface Options {
  
  readonly storage: DurableObjectStorage
  readonly app?: ServerOptions["app"]
  readonly password?: string
  
  readonly config?: { readonly content?: string }
  
  readonly models?: ServerOptions["models"]
}


export function create(options: Options) {
  
  
  
  return ServerFetch.make(serverOptions(options), { overrides: replacements(options) })
}

export function serverOptions(options: Options): ServerOptions {
  return {
    app: options.app,
    password: options.password,
    fs: { filewatcher: false, fff: false },
    
    
    
    events: { persist: true },
    config: { content: options.config?.content },
    models: options.models,
  }
}


export function replacements(options: Options): LayerNode.Replacements {
  return [
    Database.node.replace(Database.configuredClient(sqliteLayer({ storage: options.storage }))),
    CrossSpawnSpawner.node.replace(EnvironmentUnavailable.layer),
    Snapshot.node.replace(Snapshot.noopLayer),
    Vcs.node.replace(vcsLayer),
    FileSystem.node.replace(fileSystemLayer),
    FileSystemSearch.node.replace(fileSystemSearchLayer),
    Pty.node.replace(ptyLayer),
    
    
    ConfigPluginSource.node.replace(ConfigPluginSource.empty),
  ]
}

const unavailable = (what: string) => Effect.die(new Error(`${what} is unavailable in the workerd profile`))



const vcsLayer = Layer.succeed(
  Vcs.Service,
  Vcs.Service.of({
    base: () => Effect.succeed(null),
    initialize: () => Effect.fail(new Vcs.InitializeError({ kind: "unsupported" })),
    transform: () => Effect.succeed({ dispose: Effect.void }),
    reload: () => Effect.void,
    info: () => Effect.succeed({ branch: {} }),
    branches: () => Effect.succeed([]),
    status: () => Effect.succeed([]),
    diff: () => Effect.succeed([]),
  }),
)



const fileSystemLayer = Layer.succeed(
  FileSystem.Service,
  FileSystem.Service.of({
    read: () => unavailable("FileSystem.read"),
    list: () => unavailable("FileSystem.list"),
    find: () => unavailable("FileSystem.find"),
    write: () => unavailable("FileSystem.write"),
  }),
)

const fileSystemSearchLayer = Layer.succeed(
  FileSystemSearch.Service,
  FileSystemSearch.Service.of({
    find: () => unavailable("FileSystemSearch.find"),
  }),
)

const ptyLayer = Layer.succeed(
  Pty.Service,
  Pty.Service.of({
    list: () => Effect.succeed([]),
    get: (ptyID) => Effect.fail(new Pty.NotFoundError({ ptyID })),
    create: () => unavailable("Pty.create"),
    update: (ptyID) => Effect.fail(new Pty.NotFoundError({ ptyID })),
    remove: (ptyID) => Effect.fail(new Pty.NotFoundError({ ptyID })),
    write: (ptyID) => Effect.fail(new Pty.NotFoundError({ ptyID })),
    attach: (ptyID) => Effect.fail(new Pty.NotFoundError({ ptyID })),
  }),
)

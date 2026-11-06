export * as Extensions from "./index"

import { app } from "electron"
import { Context, Effect, Layer } from "effect"
import type { ExtensionEndpoint } from "../../shared/ipc-rpc/extensions"
import { ApplicationLifecycle } from "../lifecycle"
import { Shutdown } from "../lifecycle/shutdown"

const LEVELS = { debug: "Debug", info: "Info", warn: "Warn", error: "Error" } as const

import { DesktopCli } from "../service/desktop-cli"
import { DesktopStorage } from "../storage"
import { setAppQuitting } from "../windows"
import { setExtensionAssets } from "../windows/protocol"
import { extensionAsset } from "./assets"
import type { ExtensionHost } from "./host"


type LoadedHost = { host?: ExtensionHost; loading?: Promise<ExtensionHost> }

export interface Interface {
  
  readonly host: () => Promise<ExtensionHost>
  
  readonly loaded: () => ExtensionHost | undefined
  
  readonly start: Effect.Effect<void>
  
  readonly subscribe: (ipc: string, window: number) => { readonly available: boolean; readonly state?: unknown }
  readonly configure: (window: number, servers: readonly ExtensionEndpoint[]) => void
}

export class Service extends Context.Service<Service, Interface>()("chassis/desktop/Extensions") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const storage = yield* DesktopStorage.Service
    const shutdown = yield* Shutdown.Service
    const lifecycle = yield* ApplicationLifecycle.Service
    const desktopCli = yield* DesktopCli.Service
    const context = yield* Effect.context()
    const runFork = Effect.runForkWith(context)
    const runPromise = Effect.runPromiseWith(context)
    
    const subscriptions = new Map<string, Set<number>>()
    const servers = new Map<number, readonly ExtensionEndpoint[]>()
    const current: LoadedHost = {}

    setExtensionAssets((request, url) => extensionAsset(storage.db, request, url))

    
    const restart = async (handoff?: () => void | Promise<void>) => {
      setAppQuitting()
      await runPromise(lifecycle.prepareToRestart)

      if (!handoff) {
        app.relaunch()
        app.quit()

        return
      }

      await Promise.resolve()
        .then(handoff)
        .catch((cause: unknown) => {
          setAppQuitting(false)
          throw cause
        })
    }

    const host = () => {
      current.loading ??= Promise.all([import("./host"), runPromise(desktopCli.resolve)]).then(([module, cli]) => {
        current.host = module.createHost({
          db: storage.db,
          state: storage.state,
          cli: {
            version: cli.version,
            command: cli.command,
            binary: cli.binary,
            development: !app.isPackaged && !cli.binary,
          },
          subscriptions,
          servers,
          restart,
          log: (message, data) => runFork(Effect.logError(message, data)),
          write: (level, message, data) => runFork(Effect.logWithLevel(LEVELS[level])(message, data)),
        })

        return current.host
      })

      return current.loading
    }

    const stop = Effect.promise(async () => {
      if (current.loading)
        await current.loading.then(
          (loaded) => loaded.dispose(),
          () => undefined,
        )
    })

    const remove = yield* shutdown.add(stop)
    yield* Effect.addFinalizer(() => Effect.sync(remove))

    return Service.of({
      host,
      loaded: () => current.host,
      start: Effect.tryPromise(() => host().then((loaded) => loaded.start())).pipe(
        Effect.catch((error) => Effect.logError("extensions failed to start", { error })),
      ),
      subscribe(ipc, window) {
        const ids = subscriptions.get(ipc) ?? new Set()
        ids.add(window)
        subscriptions.set(ipc, ids)
        
        
        void host().then(
          (loaded) => loaded.demand(ipc),
          () => undefined,
        )

        return current.host?.snapshot(ipc, window) ?? { available: false }
      },
      configure(window, list) {
        
        servers.delete(window)
        servers.set(window, list)
      },
    })
  }),
)

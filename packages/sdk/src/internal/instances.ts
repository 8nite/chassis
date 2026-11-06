export * as SdkInstances from "./instances"

import { Instance } from "@chassis/core/instance"
import { LocationServiceMap } from "@chassis/core/location-service-map"
import { Plugin } from "@chassis/core/plugin"
import type { InstancePlugins } from "@chassis/core/plugin/instance"
import { Location } from "@chassis/schema/location"
import type { Session } from "@chassis/schema/session"
import { makeGlobalNode } from "@chassis/util/effect/app-node"
import type { LayerNode } from "@chassis/util/effect/layer-node"
import { Context, Duration, Effect, Layer, LayerMap, Scope } from "effect"

export interface Configuration {
  readonly plugins: InstancePlugins.List
}

export interface Options<R = never> {
  
  readonly key: (session: Session.Info) => string
  
  readonly configure: (key: string) => Effect.Effect<Configuration, unknown, R | Scope.Scope>
}


export function provide<R>(options: Options<R>, context: Context.Context<R>): Options {
  return {
    key: options.key,
    
    
    configure: (key) =>
      options
        .configure(key)
        .pipe(Effect.updateContext((ambient: Context.Context<Scope.Scope>) => Context.merge(context, ambient))),
  }
}


export function node(options: Options, replacements: () => LayerNode.Replacements) {
  return makeGlobalNode({
    service: Instance.Service,
    layer: layer(options, replacements),
    deps: [LocationServiceMap.node],
  })
}

export function layer(options: Options, replacements: () => LayerNode.Replacements) {
  return Layer.effect(
    Instance.Service,
    Effect.gen(function* () {
      const scope = yield* Effect.scope
      const locations = yield* LocationServiceMap.Service
      const key = (session: Session.Info) => ({
        key: options.key(session),
        ...LocationServiceMap.canonical(session.location),
      })
      const provide = (session: Session.Info) => Effect.provide(instances.get(key(session)))
      const instances: LayerMap.LayerMap<
        ReturnType<typeof key>,
        Instance.Services,
        Instance.Error
      > = yield* LayerMap.make(
        (input: ReturnType<typeof key>) =>
          Layer.unwrap(
            Effect.gen(function* () {
              const configuration = yield* options.configure(input.key).pipe(Effect.orDie)
              return Instance.layer(Location.Ref.make({ directory: input.directory, workspaceID: input.workspaceID }), {
                plugins: configuration.plugins,
                replacements: [
                  ...replacements(),
                  
                  
                  Instance.node.replace(Layer.succeed(Instance.Service, { provide })),
                  LocationServiceMap.node.replace(Layer.succeed(LocationServiceMap.Service, locations)),
                ],
              }).pipe(
                Layer.tap((context) =>
                  Effect.gen(function* () {
                    const plugins = yield* Plugin.Service
                    yield* plugins.awaitActivation
                    
                    const failed = (yield* plugins.list()).filter(
                      (plugin) =>
                        plugin.state.status === "failed" &&
                        configuration.plugins.some((configured) => configured.id === plugin.id),
                    )
                    if (failed.length > 0)
                      yield* Effect.die(
                        new Error(`Instance plugin setup failed: ${failed.map((plugin) => plugin.id).join(", ")}`),
                      )
                  }).pipe(Effect.provide(context)),
                ),
              )
            }),
          ).pipe(
            
            Layer.tapCause(() =>
              instances.invalidate(input).pipe(Effect.forkIn(scope, { startImmediately: true }), Effect.asVoid),
            ),
          ),
        { idleTimeToLive: Duration.infinity },
      )
      return Instance.Service.of({ provide })
    }),
  )
}

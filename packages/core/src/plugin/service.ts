export * as Plugin from "./service.js"



import { Plugin } from "@chassis/schema/plugin"
import type { Plugin as PluginDefinition } from "@chassis/plugin/effect/plugin"
import { Context, type Effect, type Exit } from "effect"

export interface Interface {
  readonly activate: (plugins: readonly Generation[], failures?: readonly Failure[]) => Effect.Effect<void>
  readonly list: () => Effect.Effect<Plugin.Info[]>
  readonly close: (exit: Exit.Exit<unknown, unknown>) => Effect.Effect<void>
  
  readonly awaitActivation: Effect.Effect<void>
  
  readonly hold: () => Effect.Effect<Effect.Effect<void>>
}

export type Failure = Plugin.Info & { readonly state: Extract<Plugin.State, { readonly status: "failed" }> }

export type Generation = PluginDefinition & {
  readonly revision: string
  readonly source?: Plugin.Source
  readonly features?: Plugin.Features
}

export class Service extends Context.Service<Service, Interface>()("@chassis/Plugin") {}


export const awaitActivation = Service.use((plugins) => plugins.awaitActivation)

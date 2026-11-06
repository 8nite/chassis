export * as ManagedPolicy from "./managed-policy.js"

import { Document, type Entry } from "@chassis/schema/config"
import { isDeepStrictEqual } from "node:util"
import { Wildcard } from "./util/wildcard.js"
import { ConfigPolicy } from "@chassis/schema/config/policy"
import { Context, Effect, Layer, PubSub, Stream } from "effect"
import { makeGlobalNode } from "@chassis/util/effect/app-node"


export interface State {
  readonly statements: ReadonlyArray<ConfigPolicy.Info>
  
  readonly organization?: string
}

export interface Interface {
  readonly changes: () => Stream.Stream<void>
  
  readonly current: () => State
  
  readonly set: (state: State) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@chassis/ManagedPolicy") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const changes = yield* PubSub.unbounded<void>()
    const state: { current: State } = { current: { statements: [] } }
    return Service.of({
      changes: () => Stream.fromPubSub(changes),
      current: () => state.current,
      set: (next) =>
        Effect.gen(function* () {
          const changed =
            state.current.organization !== next.organization ||
            !isDeepStrictEqual(state.current.statements, next.statements)
          state.current = next
          if (!changed) return
          yield* PubSub.publish(changes, undefined)
        }),
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [] })

export function statements(entries: readonly Entry[], organization: State) {
  return [
    ...entries
      .filter((entry): entry is Document => entry.type === "document")
      .toReversed()
      .flatMap((entry) => entry.info.experimental?.policies ?? [])
      .map((policy) => ({ ...policy, message: "Blocked by configuration policy" })),
    ...organization.statements.map((policy) => ({
      ...policy,
      message: organization.organization
        ? `Blocked by ${organization.organization}'s policy`
        : "Blocked by your organization's policy",
    })),
  ]
}

export function decision(
  policies: readonly ConfigPolicy.Info[],
  action: ConfigPolicy.Info["action"],
  resource: string,
) {
  return (
    policies.findLast((policy) => policy.action === action && Wildcard.match(resource, policy.resource))?.effect ??
    "allow"
  )
}

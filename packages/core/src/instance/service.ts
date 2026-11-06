export * as Instance from "./service.js"
export type { Services } from "../instance.js"

import { Context, type Effect } from "effect"
import type { Session } from "@chassis/schema/session"
import { Node } from "@chassis/util/effect/app-node"
import { LayerNode } from "@chassis/util/effect/layer-node"
import type { Services, Error } from "../instance.js"


export interface Interface {
  readonly provide: (
    session: Session.Info,
  ) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | Error, Exclude<R, Services>>
}

export class Service extends Context.Service<Service, Interface>()("@chassis/Instance") {}

export const node = LayerNode.unbound(Service, Node.tags.values.global)

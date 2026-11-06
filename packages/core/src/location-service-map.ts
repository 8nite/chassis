import { Context, Effect, Exit, Layer, LayerMap, RcMap } from "effect"
import { LayerNode } from "@chassis/util/effect/layer-node"
import { Node } from "@chassis/util/effect/app-node"
import { AbsolutePath } from "@chassis/schema/schema"
import path from "path"
import { Location } from "./location.js"
import type { Instance } from "./instance.js"

export class Service extends Context.Service<
  Service,
  LayerMap.LayerMap<Location.Ref, Instance.Services, Instance.Error>
>()("@chassis/example/LocationServiceMap") {
  static get(ref: Location.Ref) {
    return Layer.unwrap(Effect.map(Service, (locations) => locations.get(ref)))
  }
}

export const node = LayerNode.unbound(Service, Node.tags.values.global)

export const reload = Effect.fn("LocationServiceMap.reload")(function* () {
  const locations = yield* Service
  const refs = Array.from(yield* RcMap.keys(locations.rcMap))
  yield* Effect.forEach(refs, (ref) => locations.invalidate(ref), {
    discard: true,
    concurrency: "unbounded",
  })
  
  const results = yield* Effect.forEach(
    refs,
    (ref) => Effect.scoped(locations.contextEffect(ref)).pipe(Effect.asVoid, Effect.exit),
    { concurrency: "unbounded" },
  )
  const failure = results.find(Exit.isFailure)
  if (failure) return yield* Effect.failCause(failure.cause)
  yield* Effect.logInfo("location services reloaded", { count: refs.length })
})


export function canonical(ref: Location.Ref) {
  return Location.Ref.make({
    directory: AbsolutePath.make(process.platform === "win32" ? path.normalize(ref.directory) : ref.directory),
    workspaceID: ref.workspaceID,
  })
}

export * as LocationServiceMap from "./location-service-map.js"

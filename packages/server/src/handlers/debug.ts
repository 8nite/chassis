import { LocationServiceMap } from "@chassis/core/location-service-map"
import { Effect, Option, RcMap } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"
import { requestRef } from "../location"

export const DebugHandler = HttpApiBuilder.group(Api, "server.debug", (handlers) =>
  handlers
    .handle(
      "debug.location",
      Effect.fn(function* () {
        const locations = Option.getOrThrow(yield* Effect.serviceOption(LocationServiceMap.Service))
        return Array.from(yield* RcMap.keys(locations.rcMap))
      }),
    )
    .handle(
      "debug.location.evict",
      Effect.fn(function* (ctx) {
        const locations = Option.getOrThrow(yield* Effect.serviceOption(LocationServiceMap.Service))
        
        
        yield* locations.invalidate(requestRef(ctx.request))
      }),
    ),
)

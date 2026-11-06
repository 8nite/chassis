import { Instance } from "@chassis/core/instance/service"
import { LocationServiceMap } from "@chassis/core/location-services"
import { Session } from "@chassis/core/session"
import { LocationNotFoundError, InvalidRequestError, SessionNotFoundError } from "@chassis/protocol/errors"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerRequest } from "effect/http"
import { HttpApiMiddleware } from "effect/http-api"
import { locationErrors, requestRef, sessionInfo, type LocationServices } from "../location"

export class FormLocationMiddleware extends HttpApiMiddleware.Service<
  FormLocationMiddleware,
  { provides: LocationServices }
>()("@chassis/HttpApiFormLocation", {
  error: [InvalidRequestError, SessionNotFoundError, LocationNotFoundError],
}) {}

export const formLocationLayer = Layer.effect(
  FormLocationMiddleware,
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const instances = yield* Instance.Service
    const locations = yield* LocationServiceMap.Service

    return FormLocationMiddleware.of((effect) =>
      Effect.gen(function* () {
        const route = yield* HttpRouter.RouteContext
        if (route.params.sessionID === "global") {
          
          
          
          const request = yield* HttpServerRequest.HttpServerRequest
          return yield* effect.pipe(Effect.provide(locations.get(requestRef(request))), locationErrors)
        }

        const session = yield* sessionInfo(sessions, route.params.sessionID)
        return yield* effect.pipe(instances.provide(session), locationErrors)
      }),
    )
  }),
)

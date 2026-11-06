export * as DesktopInitialization from "./desktop-initialization"

import { app } from "electron"
import { Context, Effect, Layer } from "effect"
import { DesktopLogging } from "../native/logging"
import { marks } from "./marks"
import {
  loadProxyEnvironment,
  preferApplicationEnvironment,
  prepareApplicationEnvironment,
  prepareDesktop,
} from "./environment"

export interface Interface {
  readonly version: string
}

export class Service extends Context.Service<Service, Interface>()("chassis/desktop/DesktopInitialization") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const logging = yield* DesktopLogging.Service
    yield* preferApplicationEnvironment
    
    
    yield* Effect.forkScoped(
      prepareApplicationEnvironment.pipe(Effect.andThen(loadProxyEnvironment), Effect.andThen(logging.startNetwork)),
    )
    yield* Effect.promise(() => app.whenReady())
    yield* prepareDesktop
    marks.init = Date.now()

    return Service.of({
      version: app.getVersion(),
    })
  }),
)

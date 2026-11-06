import { expect } from "bun:test"
import { Chassis } from "@chassis/client/effect"
import { ClientApi } from "@chassis/protocol/client"
import { Authorization } from "@chassis/protocol/middleware/authorization"
import { Event } from "@chassis/schema/event"
import { Session } from "@chassis/schema/session"
import { Cause, Effect, Exit, Layer, Stream } from "effect"
import { HttpClient, HttpClientResponse, HttpRouter, HttpServer } from "effect/http"
import { HttpApi, HttpApiBuilder, HttpApiGroup } from "effect/http-api"
import { it } from "../../core/test/lib/effect"
import { schemaErrorLayer } from "../src/middleware/schema-error"



const LogApi = HttpApi.make("log").add(
  HttpApiGroup.make("server.session").add(ClientApi.groups["server.session"].endpoints["session.log"]),
)
const synced = { type: "log.synced" as const, aggregateID: "ses_test", seq: Event.Seq.make(1) }

const handler = HttpRouter.toWebHandler(
  HttpApiBuilder.layer(LogApi).pipe(
    Layer.provide(
      HttpApiBuilder.group(LogApi, "server.session", (handlers) =>
        handlers.handle("session.log", () =>
          Effect.succeed(Stream.make(synced).pipe(Stream.concat(Stream.die(new Error("log reader failed"))))),
        ),
      ),
    ),
    Layer.provide(schemaErrorLayer),
    Layer.provide(
      Layer.succeed(
        Authorization,
        Authorization.of((effect) => effect),
      ),
    ),
    Layer.provide(HttpServer.layerServices),
  ),
).handler

const fetchLog = (request: Request) => Effect.promise(() => handler(request))

it.live("encodes a mid-stream session log failure as the reserved SSE failure event", () =>
  Effect.gen(function* () {
    const response = yield* fetchLog(new Request("http://chassis.local/api/experimental/session/ses_test/log"))
    const body = yield* Effect.promise(() => response.text())
    expect(response.headers.get("content-type")).toContain("text/event-stream")
    expect(body).toContain("event: effect/http-api/stream/failure")
  }),
)

it.live("the generated Effect client fails the session log stream with the server's defect", () =>
  Effect.gen(function* () {
    const httpClient = HttpClient.make((request) =>
      fetchLog(new Request(request.url, { method: request.method })).pipe(
        Effect.map((response) => HttpClientResponse.fromWeb(request, response)),
      ),
    )
    const received: unknown[] = []
    const exit = yield* Effect.gen(function* () {
      const client = yield* Chassis.make({ baseUrl: "http://chassis.local" })
      return yield* client.session
        .log({ sessionID: Session.ID.make("ses_test") })
        .pipe(Stream.runForEach((item) => Effect.sync(() => received.push(item))))
    }).pipe(Effect.provideService(HttpClient.HttpClient, httpClient), Effect.exit)

    expect(received).toEqual([synced])
    expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true)
    if (Exit.isSuccess(exit)) return
    expect(Cause.squash(exit.cause)).toMatchObject({ message: "log reader failed" })
  }),
)

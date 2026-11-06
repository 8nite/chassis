import { MessageTooLargeError, ndJsonStream } from "@agentclientprotocol/sdk"
import { Chassis } from "@chassis/client/effect"
import { Service } from "@chassis/client/effect/service"
import { CrossSpawnSpawner } from "@chassis/util/cross-spawn-spawner"
import { Effect, Option } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http"
import { Writable } from "node:stream"
import { ACP } from "../../acp/agent"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { Standalone } from "../../services/standalone"

export default Runtime.handler(
  Commands.commands.acp,
  Effect.fn("cli.acp")(function* (input) {
    if (input.login) {
      const login = yield* Effect.promise(() => import("./auth/login"))
      return yield* login.default({
        target: Option.none(),
        method: Option.none(),
        answer: [],
        server: Option.none(),
        standalone: false,
      })
    }
    process.env.CHASSIS_CLIENT = "acp"
    const endpoint = yield* Standalone.start()
    const client = yield* Chassis.make({ baseUrl: endpoint.url }).pipe(
      Effect.provideServiceEffect(
        HttpClient.HttpClient,
        HttpClient.HttpClient.pipe(
          Effect.map(HttpClient.mapRequest(HttpClientRequest.setHeaders(Service.headers(endpoint) ?? {}))),
        ),
      ),
      Effect.provide(FetchHttpClient.layer),
    )
    const connection = yield* ACP.connect(client, ndJsonStream(Writable.toWeb(process.stdout), Bun.stdin.stream()))
    const failure = yield* Effect.raceFirst(
      Effect.promise(() => connection.closed).pipe(
        Effect.map(() =>
          connection.signal.reason instanceof MessageTooLargeError
            ? `incoming message exceeded the ${connection.signal.reason.maxMessageBytes / 1024 / 1024} MiB limit`
            : undefined,
        ),
      ),
      endpoint.exited.pipe(
        Effect.match({
          onSuccess: (code) => `code ${code}`,
          onFailure: (error) =>
            error.cause instanceof CrossSpawnSpawner.KilledBySignal ? `signal ${error.cause.signal}` : error.message,
        }),
        Effect.map((reason) => `server exited unexpectedly (${reason})`),
      ),
    )
    
    yield* Effect.sync(() => {
      if (failure) process.stderr.write(`chassis acp: ${failure}\n`)
      process.exit(failure ? 1 : 0)
    })
  }),
)

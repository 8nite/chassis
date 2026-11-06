import { Effect, Fiber, Layer, Ref } from "effect"
import * as TestClock from "effect/testing/TestClock"
import { HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from "effect/http"
import { LLMClient, RequestExecutor } from "../../src/route.js"
import type { Service as LLMClientService } from "../../src/route/client.js"
import type { Service as RequestExecutorService } from "../../src/route/executor.js"

export type HandlerInput = {
  readonly request: HttpClientRequest.HttpClientRequest
  readonly text: string
  readonly respond: (
    body: ConstructorParameters<typeof Response>[0],
    init?: ResponseInit,
  ) => HttpClientResponse.HttpClientResponse
}

export type Handler = (
  input: HandlerInput,
) => Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError>

export interface Call {
  readonly method: string
  readonly url: string
  readonly headers: Headers
  readonly body: string
}


export const observe = (calls: Array<Call>, input: HandlerInput) =>
  Effect.gen(function* () {
    const web = yield* HttpClientRequest.toWeb(input.request).pipe(Effect.orDie)
    const call = { method: web.method, url: web.url, headers: web.headers, body: input.text }
    calls.push(call)
    return { call, nth: calls.filter((seen) => seen.method === call.method && seen.url === call.url).length }
  })

export const json = (input: HandlerInput, value: unknown, init?: ResponseInit) =>
  input.respond(JSON.stringify(value), { ...init, headers: { "content-type": "application/json", ...init?.headers } })


export const settle = <A, E, R>(program: Effect.Effect<A, E, R>, seconds: number) =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(program)
    yield* TestClock.adjust(`${seconds} seconds`)
    return yield* Fiber.join(fiber)
  })

export const handlerLayer = (handler: Handler): Layer.Layer<HttpClient.HttpClient> =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.gen(function* () {
        const web = yield* HttpClientRequest.toWeb(request).pipe(Effect.orDie)
        const text = yield* Effect.promise(() => web.text())
        return yield* handler({
          request,
          text,
          respond: (body, init) => HttpClientResponse.fromWeb(request, new Response(body, init)),
        })
      }),
    ),
  )

export type RuntimeEnv = RequestExecutorService | LLMClientService

export interface SystemError extends Error {
  readonly code: string
}

export const systemError = (code: string, message: string): SystemError => Object.assign(new Error(message), { code })

export const runtimeLayer = (layer: Layer.Layer<HttpClient.HttpClient>): Layer.Layer<RuntimeEnv> => {
  const requestExecutorLayer = RequestExecutor.layer.pipe(Layer.provide(layer))
  const llmClientLayer = LLMClient.layer.pipe(Layer.provide(requestExecutorLayer))
  return Layer.mergeAll(requestExecutorLayer, llmClientLayer)
}

const SSE_HEADERS = { "content-type": "text/event-stream" } as const


export const fixedResponse = (
  body: ConstructorParameters<typeof Response>[0],
  init: ResponseInit = { headers: SSE_HEADERS },
) => runtimeLayer(handlerLayer((input) => Effect.succeed(input.respond(body, init))))


export const dynamicResponse = (handler: Handler) => runtimeLayer(handlerLayer(handler))


export const truncatedStream = (chunks: ReadonlyArray<string>, error: Error = new Error("connection reset")) =>
  dynamicResponse((input) =>
    Effect.sync(() => {
      const encoder = new TextEncoder()
      let index = 0
      const stream = new ReadableStream({
        pull(controller) {
          const chunk = chunks[index]
          if (chunk !== undefined) {
            index++
            controller.enqueue(encoder.encode(chunk))
            return
          }
          controller.error(error)
        },
      })
      return input.respond(stream, { headers: SSE_HEADERS })
    }),
  )


export const scriptedResponses = (bodies: ReadonlyArray<string>, init: ResponseInit = { headers: SSE_HEADERS }) => {
  if (bodies.length === 0) throw new Error("scriptedResponses requires at least one body")
  return Layer.unwrap(
    Effect.gen(function* () {
      const cursor = yield* Ref.make(0)
      return dynamicResponse((input) =>
        Effect.gen(function* () {
          const index = yield* Ref.getAndUpdate(cursor, (n) => n + 1)
          return input.respond(bodies[index] ?? bodies[bodies.length - 1], init)
        }),
      )
    }),
  )
}

import { Duration, Effect, Schedule, Schema, Stream } from "effect"
import { Headers, HttpClientRequest, type HttpClientResponse } from "effect/http"
import { Auth, type AuthInput } from "./auth.js"
import { Endpoint } from "./endpoint.js"
import { RequestExecutorService, type Interface } from "./executor-service.js"
import { RequestExecutor } from "./executor.js"
import { MediaProtocol } from "./media-protocol.js"
import { Generation, isTerminal } from "../generation.js"
import type { Media } from "../media.js"
import { isRetryable } from "../provider-error.js"
import {
  AIError,
  AIErrorReason,
  HttpOptions,
  InvalidRequestError,
  ProviderID,
  UnsupportedOperationError,
  mergeHttpOptions,
} from "../schema/index.js"
import { encodeJson } from "../utils/json.js"
import { sanitizeSurrogates } from "../utils/sanitize.js"

export type Execute = Interface["execute"]


export interface MediaRequest {
  readonly model: { readonly id: string; readonly provider: ProviderID; readonly http?: HttpOptions }
  readonly http?: HttpOptions
}


export interface ModelInput {
  readonly id: string
  readonly auth: Auth.Definition
  readonly baseURL?: string
  readonly headers?: Record<string, string>
  readonly http?: HttpOptions
}


export const deployment = (
  input: { readonly baseURL?: string; readonly headers?: Record<string, string>; readonly http?: HttpOptions.Input },
  auth: Auth.Definition,
): Omit<ModelInput, "id"> => ({
  auth,
  baseURL: input.baseURL,
  headers: input.headers,
  http: HttpOptions.make(input.http),
})






export interface InlineRoute<Request extends MediaRequest, Response> {
  readonly kind: "inline"
  readonly id: string
  readonly provider: ProviderID
  readonly protocol: string
  readonly generate: (request: Request, execute: Execute) => Effect.Effect<Response, AIError>
}


export interface QueuedRoute<Request extends MediaRequest, Response> {
  readonly kind: "queued"
  readonly id: string
  readonly provider: ProviderID
  readonly protocol: string
  readonly start: (request: Request, execute: Execute) => Effect.Effect<Generation<Response>, AIError>
  
  readonly resume: (
    model: MediaRequest["model"],
    token: unknown,
    execute: Execute,
  ) => Effect.Effect<Generation<Response>, AIError>
}


export interface StreamRoute<Request extends MediaRequest, Event, Response> {
  readonly kind: "stream"
  readonly id: string
  readonly provider: ProviderID
  readonly protocol: string
  readonly stream: (request: Request, execute: Execute) => Stream.Stream<Event, AIError>
  readonly generate: (request: Request, execute: Execute) => Effect.Effect<Response, AIError>
}

export type AnyRoute<Request extends MediaRequest, Event, Response> =
  | InlineRoute<Request, Response>
  | StreamRoute<Request, Event, Response>
  | QueuedRoute<Request, Response>

export interface Composition<Request extends MediaRequest> {
  readonly endpoint: Endpoint.Definition<MediaProtocol.Body, Request>
  readonly auth: Auth.Definition
  
  readonly headers?: Record<string, string>
}

export interface InlineInput<Request extends MediaRequest, Response> extends Composition<Request> {
  readonly protocol: MediaProtocol.Inline<Request, Response>
}

export interface QueuedInput<Request extends MediaRequest, Response, Token> extends Composition<Request> {
  readonly protocol: MediaProtocol.Queued<Request, Response, Token>
}

export interface StreamInput<Request extends MediaRequest, Event, Response, Frame, State>
  extends Composition<MediaProtocol.Addressed<Request>> {
  readonly protocol: MediaProtocol.Streamed<Request, Event, Frame, State>
  readonly collect: (events: ReadonlyArray<Event>) => Effect.Effect<Response, AIError>
}


export const inline = <Request extends MediaRequest, Response>(
  input: InlineInput<Request, Response>,
): InlineRoute<Request, Response> => {
  const transport = makeTransport(input)
  return {
    kind: "inline",
    id: input.protocol.id,
    provider: input.protocol.provider,
    protocol: input.protocol.id,
    generate: Effect.fn(`MediaRoute.generate`)(function* (request: Request, execute: Execute) {
      const submitted = yield* transport.submit(
        request,
        { unsupported: input.protocol.unsupported, from: input.protocol.body.from },
        execute,
      )
      return yield* input.protocol.response.decode(submitted.response, submitted.context)
    }),
  }
}

const READ_RETRY_MAX_DELAY = Duration.seconds(30)


const READ_RETRY = Schedule.max([
  Schedule.min([Schedule.exponential("1 second"), Schedule.spaced(READ_RETRY_MAX_DELAY)]),
  Schedule.recurs(8),
]).pipe(
  Schedule.jittered,
  Schedule.setInputType<AIError>(),
  Schedule.modifyDelay(({ input, duration }) =>
    Effect.succeed(
      Duration.min(
        input.reason._tag === "RateLimit" || input.reason._tag === "ProviderInternal"
          ? Duration.max(duration, Duration.millis(input.reason.retryAfterMs ?? 0))
          : duration,
        READ_RETRY_MAX_DELAY,
      ),
    ),
  ),
)


export const queued = <Request extends MediaRequest, Response, Token>(
  input: QueuedInput<Request, Response, Token>,
): QueuedRoute<Request, Response> => {
  const transport = makeTransport(input)
  const protocol = input.protocol
  const decodeToken = Schema.decodeUnknownEffect(protocol.token)
  
  const encodeToken = Schema.encodeSync(protocol.token)

  const generationRoute = (token: Token, http: HttpOptions | undefined, execute: Execute) => {
    const materialize = (asset: Media.Asset) =>
      asset.materialize().pipe(Effect.provideService(RequestExecutorService, { execute }))
    
    
    const poll = <A>(operation: {
      readonly path: (token: Token) => string
      readonly decode: (
        response: HttpClientResponse.HttpClientResponse,
        context: MediaProtocol.PollContext<Token>,
      ) => Effect.Effect<A, AIError>
    }) =>
      transport.call("GET", operation.path(token), http, execute).pipe(
        Effect.retry({ schedule: READ_RETRY, while: isRetryable }),
        Effect.flatMap((sent) => operation.decode(sent.response, { token, auth: sent.auth, materialize })),
      )
    const status = poll(protocol.status)
    const cancel = protocol.cancel
    const send =
      cancel === undefined
        ? undefined
        : transport.call(cancel.method, cancel.path(token), http, execute).pipe(Effect.asVoid)
    return {
      status,
      result: poll(protocol.result),
      cancel:
        send !== undefined && cancel?.activeOnly
          ? status.pipe(Effect.flatMap((snapshot) => (isTerminal(snapshot.status) ? Effect.void : send)))
          : send,
    }
  }

  const start = Effect.fn("MediaRoute.start")(function* (request: Request, execute: Execute) {
    const submitted = yield* transport.submit(
      request,
      { unsupported: protocol.unsupported, prepare: protocol.start.prepare, from: protocol.start.body.from },
      execute,
    )
    const started = yield* protocol.start.decode(submitted.response, submitted.context)
    const route = generationRoute(started.token, submitted.context.request.http, execute)
    return new Generation(route, encodeToken(started.token), started.snapshot)
  })

  const resume = Effect.fn("MediaRoute.resume")(function* (
    model: MediaRequest["model"],
    raw: unknown,
    execute: Execute,
  ) {
    const token = yield* decodeToken(raw).pipe(
      Effect.mapError(
        (cause) =>
          new AIError({
            reason: new InvalidRequestError({
              message: `${protocol.id} cannot resume a generation from this token`,
              cause,
            }),
          }),
      ),
    )
    const route = generationRoute(token, transport.http(model), execute)
    return new Generation(route, encodeToken(token), yield* route.status)
  })

  return { kind: "queued", id: protocol.id, provider: protocol.provider, protocol: protocol.id, start, resume }
}


export const stream = <Request extends MediaRequest, Event, Response, Frame, State>(
  input: StreamInput<Request, Event, Response, Frame, State>,
): StreamRoute<Request, Event, Response> => {
  const transport = makeTransport(input)
  const protocol = input.protocol
  const events = (request: Request, execute: Execute, mode: MediaProtocol.Mode) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const submitted = yield* transport.submit(
          { ...request, mode },
          { unsupported: protocol.unsupported, from: protocol.body.from },
          execute,
        )
        const http = RequestExecutor.responseHttp(submitted.response)
        return Stream.suspend(() => {
          
          let state = protocol.initial()
          return protocol.frames(RequestExecutor.responseStream(submitted.response), submitted.context).pipe(
            Stream.mapEffect((frame) =>
              protocol.step(state, frame).pipe(
                Effect.map(([next, output]) => {
                  state = next
                  return output
                }),
              ),
            ),
            Stream.flattenIterable,
            Stream.concat(
              Stream.suspend(() => Stream.fromIterableEffect(protocol.finish(state, { ...submitted.context, http }))),
            ),
            Stream.mapError((error) =>
              error.reason.http !== undefined
                ? error
                : new AIError({
                    reason: AIErrorReason.make({
                      ...error.reason,
                      message: error.reason.message,
                      cause: error.reason.cause,
                      http,
                    }),
                  }),
            ),
          )
        })
      }),
    )
  return {
    kind: "stream",
    id: protocol.id,
    provider: protocol.provider,
    protocol: protocol.id,
    stream: (request, execute) => events(request, execute, "stream"),
    generate: (request, execute) =>
      events(request, execute, "generate").pipe(Stream.runCollect, Effect.flatMap(input.collect)),
  }
}





const makeTransport = <Request extends MediaRequest>(
  input: Composition<Request> & { readonly protocol: { readonly id: string; readonly provider: ProviderID } },
) => {
  const routeHttp = input.headers === undefined ? undefined : new HttpOptions({ headers: input.headers })
  const authorize = Auth.toEffect(input.auth)
  const baseURL = (path: string) => new URL(`${Endpoint.trimBaseUrl(input.endpoint.baseURL ?? "")}${path}`)
  
  const send = Effect.fn("MediaRoute.send")(function* (
    call: {
      readonly method: AuthInput["method"]
      readonly url: URL
      readonly headers: Headers.Headers
      readonly request: AuthInput["request"]
      readonly body?: MediaProtocol.Body
    },
    execute: Execute,
  ) {
    const encoded = encode(call.body, call.headers)
    const url = call.url.toString()
    const headers = yield* authorize({
      request: call.request,
      method: call.method,
      url,
      body: encoded.text,
      headers: encoded.headers,
    })
    const response = yield* execute(
      encoded.apply(HttpClientRequest.make(call.method)(url).pipe(HttpClientRequest.setHeaders(headers))),
    )
    return {
      response,
      auth: Object.fromEntries(Object.entries(headers).filter(([key, value]) => encoded.headers[key] !== value)),
    }
  })
  return {
    
    http: (model: MediaRequest["model"]) => mergeHttpOptions(routeHttp, model.http),
    
    submit: Effect.fn("MediaRoute.submit")(function* (
      request: Request,
      protocol: {
        readonly unsupported?: ReadonlyArray<keyof Request & string>
        readonly prepare?: MediaProtocol.Prepare<Request>
        readonly from: (request: Request) => Effect.Effect<MediaProtocol.Body, AIError>
      },
      execute: Execute,
    ) {
      yield* rejectUnsupported(input.protocol.id, input.protocol.provider, request, protocol.unsupported)
      const http = mergeHttpOptions(routeHttp, request.model.http, request.http)
      const headers = Headers.fromInput(http?.headers)
      const prepared =
        protocol.prepare === undefined
          ? request
          : yield* protocol.prepare(request, (path, body) =>
              send({ method: "POST", url: baseURL(path), headers, request, body }, execute).pipe(
                Effect.map((sent) => sent.response),
              ),
            )
      
      const resolved: Request = { ...sanitizeSurrogates({ ...prepared, http }), model: request.model }
      const body = yield* protocol.from(resolved)
      const url = withQuery(
        withQuery(
          Endpoint.render(input.endpoint, { request: resolved, body }),
          body.type === "multipart" ? undefined : body.query,
        ),
        http?.query,
      )
      const sent = yield* send({ method: "POST", url, headers, request: resolved, body }, execute)
      return { response: sent.response, context: { request: resolved, body } }
    }),
    
    call: (method: AuthInput["method"], path: string, http: HttpOptions | undefined, execute: Execute) => {
      
      const url = withQuery(/^https?:\/\//.test(path) ? new URL(path) : baseURL(path), http?.query)
      for (const [key, value] of Object.entries(input.endpoint.query ?? {})) url.searchParams.set(key, value)
      return send({ method, url, headers: Headers.fromInput(http?.headers), request: { http } }, execute)
    },
  }
}

const withQuery = (url: URL, query: MediaProtocol.Query | undefined) => {
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.delete(key)
    for (const item of typeof value === "string" ? [value] : value) url.searchParams.append(key, item)
  }
  return url
}

const encode = (body: MediaProtocol.Body | undefined, headers: Headers.Headers) => {
  if (body === undefined) return { text: "", headers, apply: (request: HttpClientRequest.HttpClientRequest) => request }
  if (body.type === "json") {
    const text = encodeJson(body.value)
    return { text, headers, apply: HttpClientRequest.bodyText(text, "application/json") }
  }
  if (body.type === "binary")
    return {
      text: `[${body.contentType}]`,
      headers,
      apply: HttpClientRequest.bodyUint8Array(body.value, body.contentType),
    }
  return {
    text: "[multipart/form-data]",
    
    headers: Headers.remove(headers, "content-type"),
    apply: HttpClientRequest.bodyFormData(body.value),
  }
}


const rejectUnsupported = <Request extends object>(
  route: string,
  provider: ProviderID,
  request: Request,
  unsupported: ReadonlyArray<keyof Request & string> | undefined,
): Effect.Effect<void, AIError> => {
  const present = (unsupported ?? []).filter((field) => {
    const value = request[field]
    return Array.isArray(value) ? value.length > 0 : value !== undefined
  })
  if (present.length === 0) return Effect.void
  return Effect.fail(
    new AIError({
      reason: new UnsupportedOperationError({
        operation: `media.${present[0]}`,
        provider,
        route,
        message: `${provider}/${route} does not support ${present.join(", ")}`,
      }),
    }),
  )
}

export * as MediaRoute from "./media.js"

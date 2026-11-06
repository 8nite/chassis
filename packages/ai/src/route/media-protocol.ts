import { Clock, Duration, Effect, Schema, type Stream } from "effect"
import { HttpClientResponse } from "effect/http"
import type { Snapshot, Status } from "../generation.js"
import { Media } from "../media.js"
import type { AuthInput } from "./auth.js"
import {
  AIError,
  AuthenticationError,
  ContentPolicyError,
  HttpContext,
  InvalidProviderOutputError,
  InvalidRequestError,
  ProviderID,
  ProviderInternalError,
  RateLimitError,
  UnsupportedOperationError,
} from "../schema/index.js"






export type Query = Readonly<Record<string, string | ReadonlyArray<string>>>


export type Body =
  | { readonly type: "json"; readonly value: Record<string, unknown>; readonly query?: Query }
  | { readonly type: "multipart"; readonly value: FormData }
  | {
      readonly type: "binary"
      readonly value: Uint8Array
      readonly contentType: string
      readonly query?: Query
    }

export const json = (value: Record<string, unknown>, query?: Query): Body => ({
  type: "json",
  value,
  query,
})
export const multipart = (value: FormData): Body => ({ type: "multipart", value })
export const binary = (value: Uint8Array, contentType: string, query?: Query): Body => ({
  type: "binary",
  value,
  contentType,
  query,
})

export type Send = (path: string, body: Body) => Effect.Effect<HttpClientResponse.HttpClientResponse, AIError>


export type Prepare<Request> = (request: Request, send: Send) => Effect.Effect<Request, AIError>





export interface DecodeContext<Request> {
  readonly request: Request
  readonly body: Body
}


export interface Inline<Request, Response> {
  readonly kind: "inline"
  readonly id: string
  readonly provider: ProviderID
  
  readonly unsupported?: ReadonlyArray<keyof Request & string>
  readonly body: { readonly from: (request: Request) => Effect.Effect<Body, AIError> }
  readonly response: {
    readonly decode: (
      response: HttpClientResponse.HttpClientResponse,
      context: DecodeContext<Request>,
    ) => Effect.Effect<Response, AIError>
  }
}

export const inline = <Request, Response>(
  route: Identity,
  input: Omit<Inline<Request, Response>, "kind" | "id" | "provider">,
): Inline<Request, Response> => ({ kind: "inline", id: route.id, provider: route.provider, ...input })


export interface Started<Token> {
  readonly token: Token
  readonly snapshot: Snapshot
}


export interface PollContext<Token> {
  readonly token: Token
  readonly auth: Record<string, string>
  readonly materialize: (asset: Media.Asset) => Effect.Effect<Media.Asset, AIError>
}


export interface Queued<Request, Response, Token> {
  readonly kind: "queued"
  readonly id: string
  readonly provider: ProviderID
  
  readonly unsupported?: ReadonlyArray<keyof Request & string>
  
  readonly token: Schema.Codec<Token, unknown>
  readonly start: {
    readonly prepare?: Prepare<Request>
    readonly body: { readonly from: (request: Request) => Effect.Effect<Body, AIError> }
    readonly decode: (
      response: HttpClientResponse.HttpClientResponse,
      context: DecodeContext<Request>,
    ) => Effect.Effect<Started<Token>, AIError>
  }
  readonly status: {
    readonly path: (token: Token) => string
    readonly decode: (
      response: HttpClientResponse.HttpClientResponse,
      context: PollContext<Token>,
    ) => Effect.Effect<Snapshot, AIError>
  }
  readonly result: {
    readonly path: (token: Token) => string
    readonly decode: (
      response: HttpClientResponse.HttpClientResponse,
      context: PollContext<Token>,
    ) => Effect.Effect<Response, AIError>
  }
  readonly cancel?: {
    readonly method: AuthInput["method"]
    readonly path: (token: Token) => string
    
    readonly activeOnly?: boolean
  }
}

export const queued = <Request, Response, Token>(
  route: Identity,
  input: Omit<Queued<Request, Response, Token>, "kind" | "id" | "provider">,
): Queued<Request, Response, Token> => ({ kind: "queued", id: route.id, provider: route.provider, ...input })

export type Mode = "generate" | "stream"

export type Addressed<Request> = Request & { readonly mode: Mode }

export interface ResponseContext<Request> extends DecodeContext<Addressed<Request>> {
  readonly http: HttpContext
}


export interface Streamed<Request, Event, Frame, State> {
  readonly kind: "stream"
  readonly id: string
  readonly provider: ProviderID
  
  readonly unsupported?: ReadonlyArray<keyof Request & string>
  readonly body: { readonly from: (request: Addressed<Request>) => Effect.Effect<Body, AIError> }
  readonly frames: (
    bytes: Stream.Stream<Uint8Array, AIError>,
    context: DecodeContext<Addressed<Request>>,
  ) => Stream.Stream<Frame, AIError>
  readonly initial: () => State
  readonly step: (state: State, frame: Frame) => Effect.Effect<readonly [State, ReadonlyArray<Event>], AIError>
  
  readonly finish: (state: State, context: ResponseContext<Request>) => Effect.Effect<ReadonlyArray<Event>, AIError>
}

export const stream = <Request, Event, Frame, State>(
  route: Identity,
  input: Omit<Streamed<Request, Event, Frame, State>, "kind" | "id" | "provider">,
): Streamed<Request, Event, Frame, State> => ({ kind: "stream", id: route.id, provider: route.provider, ...input })






const FAILURES = {
  InvalidRequest: InvalidRequestError,
  Authentication: AuthenticationError,
  RateLimit: RateLimitError,
  ProviderInternal: ProviderInternalError,
}

export type Failure = keyof typeof FAILURES

const context = (response: HttpClientResponse.HttpClientResponse) =>
  new HttpContext({ url: response.request.url, status: response.status, headers: response.headers })


export const identity = (input: { readonly id: string; readonly name: string; readonly provider: string }) => {
  const provider = ProviderID.make(input.provider)
  const frameError = (message: string, body?: string, cause?: unknown) =>
    new AIError({ reason: new InvalidProviderOutputError({ route: input.id, message, body, cause }) })

  
  const text = Effect.fn("MediaProtocol.text")(function* (response: HttpClientResponse.HttpClientResponse) {
    const http = context(response)
    const body = yield* response.text.pipe(
      Effect.mapError(
        (cause) =>
          new AIError({
            reason: new InvalidProviderOutputError({
              route: input.id,
              message: `Failed to read the ${input.name} response`,
              http,
              cause,
            }),
          }),
      ),
    )
    return {
      body,
      http,
      invalid: (message: string, cause?: unknown) =>
        new AIError({ reason: new InvalidProviderOutputError({ route: input.id, message, body, http, cause }) }),
      ended: (
        status: Exclude<Status, "queued" | "running" | "completed">,
        message: string,
        failure: Failure = "ProviderInternal",
      ) =>
        new AIError({
          reason:
            status === "failed"
              ? new FAILURES[failure]({ message, body, http })
              : new InvalidRequestError({ message, body, http }),
        }),
      pending: (id: string) =>
        new AIError({
          reason: new InvalidRequestError({
            message: `${input.name} generation ${id} has not finished; await it before reading the result`,
            body,
            http,
          }),
        }),
      contentPolicy: (message: string) => new AIError({ reason: new ContentPolicyError({ message, body, http }) }),
    }
  })

  
  const decodeJson = <A>(schema: Schema.Codec<A, unknown>) => {
    const decode = Schema.decodeUnknownEffect(Schema.fromJsonString(schema))
    return Effect.fn("MediaProtocol.decodeJson")(function* (response: HttpClientResponse.HttpClientResponse) {
      const output = yield* text(response)
      const value = yield* decode(output.body).pipe(
        Effect.mapError((cause) => output.invalid(`${input.name} returned an invalid response`, cause)),
      )
      return { ...output, value }
    })
  }

  return {
    id: input.id,
    name: input.name,
    provider,
    text,
    decodeJson,
    
    decodeStarted: <A, Token>(schema: Schema.Codec<A, unknown>, started: (value: A) => Started<Token>) => {
      const decode = decodeJson(schema)
      return (response: HttpClientResponse.HttpClientResponse) =>
        decode(response).pipe(Effect.map((output) => started(output.value)))
    },
    
    decodeFrame: <A>(schema: Schema.Codec<A, unknown>) => {
      const decode = Schema.decodeUnknownEffect(Schema.fromJsonString(schema))
      return (frame: string) =>
        decode(frame).pipe(
          Effect.mapError((cause) => frameError(`${input.name} sent an invalid stream event`, frame, cause)),
        )
    },
    
    frameError,
    incomplete: () =>
      new AIError({
        reason: new InvalidProviderOutputError({
          route: input.id,
          message: "The provider response ended unexpectedly.",
          classification: "incomplete-stream",
        }),
      }),
    unsupported: (operation: string, message: string) =>
      new AIError({ reason: new UnsupportedOperationError({ operation, provider, route: input.id, message }) }),
  }
}

export type Identity = ReturnType<typeof identity>

export type Output = Effect.Success<ReturnType<Identity["text"]>>


export const status = <Table extends Record<string, Status>>(
  table: Table,
  raw: string,
  output: Output,
): Effect.Effect<Status, AIError> => {
  if (!Object.hasOwn(table, raw)) return Effect.fail(output.invalid(`Unknown generation status "${raw}"`))
  return Effect.succeed(table[raw])
}


export const failure = (table: Readonly<Record<string, Failure>>, code: string | number | undefined): Failure =>
  code !== undefined && Object.hasOwn(table, code) ? table[code] : "ProviderInternal"


export const expiringUrl = (url: string, retention: Duration.Duration, options?: Parameters<typeof Media.url>[1]) =>
  Clock.currentTimeMillis.pipe(
    Effect.map((now) => Media.url(url, { ...options, expiresAt: now + Duration.toMillis(retention) })),
  )

export * as MediaProtocol from "./media-protocol.js"

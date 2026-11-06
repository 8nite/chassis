import { Effect } from "effect"
import { Endpoint } from "./route/endpoint.js"
import { MediaRoute } from "./route/media.js"
import type { MediaProtocol } from "./route/media-protocol.js"
import { AIError, HttpOptions, InvalidRequestError, ModelID, ProviderID } from "./schema/index.js"


export class MediaModel<Route, Options> {
  
  
  declare protected readonly _Options: Options
  readonly id: ModelID
  readonly provider: ProviderID
  readonly route: Route
  readonly http?: HttpOptions

  constructor(input: MediaModel.Input<Route>) {
    this.id = ModelID.make(input.id)
    this.provider = ProviderID.make(input.provider)
    this.route = input.route
    this.http = input.http
  }
}

export namespace MediaModel {
  export type Options = Record<string, unknown>

  export interface Input<Route> {
    readonly id: string | ModelID
    readonly provider: string | ProviderID
    readonly route: Route
    readonly http?: HttpOptions
  }

  
  export interface RouteInput<Request extends MediaRoute.MediaRequest, Protocol> {
    readonly protocol: Protocol
    readonly path: Endpoint.EndpointPart<MediaProtocol.Body, Request>
    readonly baseURL?: string
    
    readonly headers?: Record<string, string>
  }

  export type InlineRouteInput<Request extends MediaRoute.MediaRequest, Response> = RouteInput<
    Request,
    MediaProtocol.Inline<Request, Response>
  >

  export type StreamRouteInput<Request extends MediaRoute.MediaRequest, Event, Frame, State> = RouteInput<
    MediaProtocol.Addressed<Request>,
    MediaProtocol.Streamed<Request, Event, Frame, State>
  >

  export type QueuedRouteInput<Request extends MediaRoute.MediaRequest, Response, Token> = RouteInput<
    Request,
    MediaProtocol.Queued<Request, Response, Token>
  >

  export type AnyRouteInput<Request extends MediaRoute.MediaRequest, Event, Response, Frame, State, Token> =
    | InlineRouteInput<Request, Response>
    | StreamRouteInput<Request, Event, Frame, State>
    | QueuedRouteInput<Request, Response, Token>
}


export const composeRoute = <Request extends MediaRoute.MediaRequest, Event, Response, Frame, State, Token>(
  route: MediaModel.AnyRouteInput<Request, Event, Response, Frame, State, Token>,
  input: MediaRoute.ModelInput,
  collect: (events: ReadonlyArray<Event>) => Effect.Effect<Response, AIError>,
): MediaRoute.AnyRoute<Request, Event, Response> => {
  if (isStreamInput(route)) return MediaRoute.stream({ ...composition(route, input), collect })
  if (isQueuedInput(route)) return MediaRoute.queued(composition(route, input))
  return MediaRoute.inline(composition(route, input))
}

const composition = <Request extends MediaRoute.MediaRequest, Protocol>(
  route: MediaModel.RouteInput<Request, Protocol>,
  input: MediaRoute.ModelInput,
): MediaRoute.Composition<Request> & { readonly protocol: Protocol } => ({
  protocol: route.protocol,
  endpoint: Endpoint.path(route.path, { baseURL: input.baseURL ?? route.baseURL }),
  auth: input.auth,
  headers:
    route.headers === undefined && input.headers === undefined ? undefined : { ...route.headers, ...input.headers },
})

const isStreamInput = <Request extends MediaRoute.MediaRequest, Event, Response, Frame, State, Token>(
  route: MediaModel.AnyRouteInput<Request, Event, Response, Frame, State, Token>,
): route is MediaModel.StreamRouteInput<Request, Event, Frame, State> => route.protocol.kind === "stream"

const isQueuedInput = <Request extends MediaRoute.MediaRequest, Event, Response, Frame, State, Token>(
  route: MediaModel.AnyRouteInput<Request, Event, Response, Frame, State, Token>,
): route is MediaModel.QueuedRouteInput<Request, Response, Token> => route.protocol.kind === "queued"


export const tryRequest = <A>(make: () => A): Effect.Effect<A, AIError> =>
  Effect.try({
    try: make,
    catch: (error) =>
      new AIError({
        reason: new InvalidRequestError({
          message: error instanceof Error ? error.message : String(error),
          cause: error,
        }),
      }),
  })

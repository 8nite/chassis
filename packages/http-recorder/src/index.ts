import { Layer } from "effect"
import { HttpClient } from "effect/http"
import { Socket } from "effect/socket"
import { Api } from "./api.js"
import { hasCassetteSync, removeCassetteSync } from "./cassette/store.js"
import { layer, layerFetch } from "./http/recorder.js"
import { layerSocket, layerWebSocketConstructor } from "./websocket/recorder.js"


export const HttpRecorder: {
  readonly layer: (
    name: string,
    options?: Api.RecorderOptions,
  ) => Layer.Layer<HttpClient.HttpClient, never, HttpClient.HttpClient>
  readonly layerFetch: (name: string, options?: Api.RecorderOptions) => Layer.Layer<HttpClient.HttpClient>
  readonly layerSocket: (
    name: string,
    options?: Api.SocketRecorderOptions,
  ) => Layer.Layer<Socket.Socket, never, Socket.Socket>
  readonly layerWebSocketConstructor: (
    name: string,
    options?: Api.SocketRecorderOptions,
  ) => Layer.Layer<Socket.WebSocketConstructor, never, Socket.WebSocketConstructor>
  readonly hasCassetteSync: (name: string, options?: { readonly directory?: string }) => boolean
  readonly removeCassetteSync: (name: string, options?: { readonly directory?: string }) => void
} = { hasCassetteSync, layer, layerFetch, layerSocket, layerWebSocketConstructor, removeCassetteSync }

export namespace HttpRecorder {
  
  export type JsonValue = Api.JsonValue
  
  export type CassetteMetadata = Api.CassetteMetadata
  
  export type RecorderOptions = Api.RecorderOptions
  
  export type RedactOptions = Api.RedactOptions
  
  export type RequestMatcher = Api.RequestMatcher
  
  export type RequestSnapshot = Api.RequestSnapshot
  
  export type SocketRecorderOptions = Api.SocketRecorderOptions
}

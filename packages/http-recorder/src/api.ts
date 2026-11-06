
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue }


export type CassetteMetadata = Readonly<Record<string, JsonValue>>


export interface RequestSnapshot {
  readonly method: string
  readonly url: string
  readonly headers: Record<string, string>
  readonly body: string
}


export type RequestMatcher = (incoming: RequestSnapshot, recorded: RequestSnapshot) => boolean


export interface RedactOptions {
  readonly headers?: ReadonlyArray<string>
  readonly allowRequestHeaders?: ReadonlyArray<string>
  readonly allowResponseHeaders?: ReadonlyArray<string>
  readonly queryParameters?: ReadonlyArray<string>
  readonly jsonFields?: ReadonlyArray<string>
  readonly url?: (url: string) => string
  readonly body?: (body: string) => string
}


export interface RecorderOptions {
  readonly directory?: string
  readonly metadata?: CassetteMetadata
  readonly redact?: RedactOptions
  readonly match?: RequestMatcher
}


export type SocketRecorderOptions = Omit<RecorderOptions, "match">

export * as Api from "./api.js"

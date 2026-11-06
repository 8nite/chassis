export * as Media from "./media.js"

import { Effect, FileSystem, Schema, SchemaGetter } from "effect"
import { Base64 } from "effect/encoding"
import { HttpClientRequest } from "effect/http"
import { ProviderID } from "./schema/ids.js"
import { AIError, HttpContext, InvalidProviderOutputError, InvalidRequestError } from "./schema/errors.js"
import { ProviderMetadata } from "./schema/options.js"
import { Service } from "./route/executor-service.js"
import { detectMediaType, fileMediaType } from "./utils/media-type.js"

export { detectMediaType } from "./utils/media-type.js"

const OCTET_STREAM = "application/octet-stream"





const BytesSource = Schema.Struct({
  type: Schema.Literal("bytes"),
  data: Schema.Uint8Array,
  mediaType: Schema.String,
})

const Base64Source = Schema.Struct({
  type: Schema.Literal("base64"),
  data: Schema.String,
  mediaType: Schema.String,
})

const UrlSource = Schema.Struct({
  type: Schema.Literal("url"),
  url: Schema.String,
  mediaType: Schema.optional(Schema.String),
  
  expiresAt: Schema.optional(Schema.Number),
})


const RefSource = Schema.Struct({
  type: Schema.Literal("ref"),
  provider: ProviderID,
  id: Schema.String,
  mediaType: Schema.optional(Schema.String),
})

export const Source = Schema.Union([BytesSource, Base64Source, UrlSource, RefSource])
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "Media.Source" })
export type Source = Schema.Schema.Type<typeof Source>





export type AspectRatio = `${number}:${number}`
export const AspectRatio = Schema.declare<AspectRatio>(
  (value): value is AspectRatio => typeof value === "string" && /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(value),
  { title: "Media.AspectRatio" },
)

export const Kind = Schema.Literals(["image", "video", "audio", "document", "other"])
export type Kind = Schema.Schema.Type<typeof Kind>

export const kindOf = (mediaType: string): Kind => {
  const lower = mediaType.toLowerCase()
  if (lower.startsWith("image/")) return "image"
  if (lower.startsWith("video/")) return "video"
  if (lower.startsWith("audio/")) return "audio"
  if (lower === "application/pdf" || lower.startsWith("text/")) return "document"
  return "other"
}


export const Info = Schema.Struct({
  width: Schema.optional(Schema.Number),
  height: Schema.optional(Schema.Number),
  durationSeconds: Schema.optional(Schema.Number),
  sampleRate: Schema.optional(Schema.Number),
  channels: Schema.optional(Schema.Number),
  encoding: Schema.optional(Schema.String),
  format: Schema.optional(Schema.String),
}).annotate({ identifier: "Media.Info" })
export type Info = Schema.Schema.Type<typeof Info>


export const Notice = Schema.Struct({
  type: Schema.Literals(["moderated", "filtered", "other"]),
  message: Schema.String,
  providerMetadata: Schema.optional(ProviderMetadata),
}).annotate({ identifier: "Media.Notice" })
export type Notice = Schema.Schema.Type<typeof Notice>





const invalid = (message: string, cause?: unknown) =>
  new AIError({ reason: new InvalidRequestError({ message, cause }) })


export interface Inline {
  readonly mime: string
  readonly base64: string
  readonly dataUrl: string
}

export class Asset {
  readonly source: Source
  
  readonly mediaType: string
  readonly kind: Kind
  readonly info?: Info
  
  readonly expiresAt?: number
  readonly providerMetadata?: ProviderMetadata
  
  readonly headers?: Record<string, string>

  
  
  
  #bytes: Uint8Array | undefined
  #base64: string | undefined

  constructor(input: Asset.Input) {
    this.source = input.source
    this.mediaType =
      input.source.mediaType ??
      (input.source.type === "bytes" ? detectMediaType(input.source.data) : undefined) ??
      OCTET_STREAM
    this.kind = kindOf(this.mediaType)
    this.info = input.info
    this.expiresAt = input.source.type === "url" ? input.source.expiresAt : undefined
    this.providerMetadata = input.providerMetadata
    this.headers = input.source.type === "url" ? input.headers : undefined
  }

  
  inline(): Inline | undefined {
    const source = this.source
    if (source.type !== "bytes" && source.type !== "base64") return undefined
    const base64 = source.type === "base64" ? source.data : (this.#base64 ??= Base64.encode(source.data))
    const mime = this.mediaType.toLowerCase()
    return { mime, base64, dataUrl: `data:${mime};base64,${base64}` }
  }

  
  bytes(): Effect.Effect<Uint8Array, AIError, Service> {
    return Effect.suspend(() => {
      const source = this.source
      if (source.type === "bytes") return Effect.succeed(source.data)
      if (this.#bytes !== undefined) return Effect.succeed(this.#bytes)
      if (source.type === "ref")
        return Effect.fail(invalid(`Cannot materialize provider ref ${source.provider}:${source.id}`))
      const decoded =
        source.type === "base64"
          ? Effect.fromResult(Base64.decode(source.data)).pipe(
              Effect.mapError((cause) => invalid(`Media asset contains invalid base64 data`, cause)),
            )
          : download(source, this.headers)
      return decoded.pipe(Effect.tap((data) => Effect.sync(() => (this.#bytes = data))))
    })
  }

  base64(): Effect.Effect<string, AIError, Service> {
    return Effect.suspend(() => {
      const source = this.source
      if (source.type === "base64") return Effect.succeed(source.data)
      if (this.#base64 !== undefined) return Effect.succeed(this.#base64)
      return this.bytes().pipe(Effect.map((data) => (this.#base64 = Base64.encode(data))))
    })
  }

  dataUrl(): Effect.Effect<string, AIError, Service> {
    return this.base64().pipe(Effect.map((data) => `data:${this.mediaType};base64,${data}`))
  }

  
  toJSON() {
    const source = this.source
    return {
      source: source.type === "bytes" ? { ...source, data: Base64.encode(source.data) } : source,
      info: this.info,
      providerMetadata: this.providerMetadata,
    }
  }

  
  materialize(): Effect.Effect<Asset, AIError, Service> {
    if (this.source.type === "bytes" || this.source.type === "base64") return Effect.succeed(this)
    return this.bytes().pipe(
      Effect.map((data) =>
        bytes(data, this.source.mediaType, { info: this.info, providerMetadata: this.providerMetadata }),
      ),
    )
  }
}

export namespace Asset {
  export interface Input {
    readonly source: Source
    readonly info?: Info
    readonly providerMetadata?: ProviderMetadata
    
    readonly headers?: Record<string, string>
  }
}


export const AssetEncoded = Schema.Struct({
  source: Source,
  info: Schema.optional(Info),
  providerMetadata: Schema.optional(ProviderMetadata),
}).annotate({ identifier: "Media.AssetEncoded" })

const encodeAsset = (asset: Asset): typeof AssetEncoded.Type => ({
  source: asset.source,
  info: asset.info,
  providerMetadata: asset.providerMetadata,
})

const AssetInstance = Schema.declare((value): value is Asset => value instanceof Asset, {
  expected: "Media.Asset",
})


export const AssetSchema = AssetEncoded.pipe(
  Schema.decodeTo(AssetInstance, {
    decode: SchemaGetter.transform((encoded) => new Asset(encoded)),
    encode: SchemaGetter.transform(encodeAsset),
  }),
)

const download = Effect.fn("Media.download")(function* (
  source: Extract<Source, { readonly type: "url" }>,
  headers: Record<string, string> | undefined,
) {
  const executor = yield* Service
  const response = yield* executor.execute(
    HttpClientRequest.get(source.url).pipe(HttpClientRequest.setHeaders(headers ?? {})),
  )
  const buffer = yield* response.arrayBuffer.pipe(
    Effect.mapError(
      (cause) =>
        new AIError({
          reason: new InvalidProviderOutputError({
            message: `Failed to read media from ${source.url}`,
            http: new HttpContext({ url: response.request.url, status: response.status, headers: response.headers }),
            cause,
          }),
        }),
    ),
  )
  return new Uint8Array(buffer)
})





export type AssetOptions = Omit<Asset.Input, "source">

export const from = (source: Source, options?: AssetOptions) => new Asset({ ...options, source })

export const bytes = (data: Uint8Array, mediaType?: string, options?: AssetOptions) =>
  from({ type: "bytes", data, mediaType: mediaType ?? detectMediaType(data) ?? OCTET_STREAM }, options)

export const base64 = (data: string, mediaType: string, options?: AssetOptions) =>
  from({ type: "base64", data, mediaType }, options)

export const url = (
  value: string,
  options?: AssetOptions & Omit<Extract<Source, { readonly type: "url" }>, "type" | "url">,
) => {
  const { mediaType, expiresAt, ...rest } = options ?? {}
  return from({ type: "url", url: value, mediaType, expiresAt }, rest)
}

export const ref = (provider: string | ProviderID, id: string, mediaType?: string, options?: AssetOptions) =>
  from({ type: "ref", provider: ProviderID.make(provider), id, mediaType }, options)

const DATA_URL = /^data:([^;,]+)(?:;[^,]*)*;base64,(.*)$/s


export const parseDataUrl = (value: string, options?: AssetOptions) => {
  const match = DATA_URL.exec(value)
  return match === null ? undefined : base64(match[2], match[1], options)
}


export const fromDataUrl = (dataUrl: string, options?: AssetOptions) => {
  const asset = parseDataUrl(dataUrl, options)
  if (asset === undefined) throw invalid("Media data URLs must contain a MIME type and base64 data")
  return asset
}


export const file = (path: string, options?: AssetOptions): Effect.Effect<Asset, AIError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const data = yield* fs
      .readFile(path)
      .pipe(Effect.mapError((cause) => invalid(`Failed to read media file ${path}`, cause)))
    return bytes(data, fileMediaType(data, path), options)
  })


export const write = (asset: Asset, path: string): Effect.Effect<void, AIError, FileSystem.FileSystem | Service> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const data = yield* asset.bytes()
    yield* fs
      .writeFile(path, data)
      .pipe(Effect.mapError((cause) => invalid(`Failed to write media file ${path}`, cause)))
  })

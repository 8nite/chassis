import { Effect } from "effect"
import { Base64 } from "effect/encoding"
import { Media } from "../../media.js"
import type { MediaProtocol } from "../../route/media-protocol.js"
import { mergeJsonRecords, type AIError, type ProviderID } from "../../schema/index.js"
import { encodeJson } from "../../utils/json.js"
import { ProviderShared } from "../shared.js"


export const inlineBytes = (route: string, asset: Media.Asset): Effect.Effect<Uint8Array, AIError> => {
  if (asset.source.type === "bytes") return Effect.succeed(asset.source.data)
  const inline = asset.inline()
  if (!inline) return Effect.fail(ProviderShared.inlineRequired(route, asset))
  return Effect.fromResult(Base64.decode(inline.base64)).pipe(
    Effect.mapError((cause) => ProviderShared.invalidRequest(`${route} media contains invalid base64 data`, cause)),
  )
}


export const blob = (data: Uint8Array, mediaType: string) => {
  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(data)
  return new Blob([buffer], { type: mediaType })
}

const isScalar = (value: unknown): value is string | number | boolean =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"

export const query = (route: string, values: Record<string, unknown>): Effect.Effect<MediaProtocol.Query, AIError> => {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined)
  const invalid = entries.find(([, value]) => !isScalar(value) && !(Array.isArray(value) && value.every(isScalar)))
  if (invalid !== undefined)
    return Effect.fail(ProviderShared.invalidRequest(`${route} cannot send "${invalid[0]}" as a query parameter`))
  return Effect.succeed(
    Object.fromEntries(entries.map(([key, value]) => [key, Array.isArray(value) ? value.map(String) : String(value)])),
  )
}

export const dimensions = (size: string) => {
  const [width, height] = size.split("x").map(Number)
  return { width, height }
}


export const refID = (asset: Media.Asset, provider: ProviderID) =>
  asset.source.type === "ref" && asset.source.provider === provider ? asset.source.id : undefined


export const decodedAsset = (
  invalid: (message: string, cause?: unknown) => AIError,
  label: string,
  data: string,
  mediaType: string | undefined,
  options?: Media.AssetOptions,
) =>
  Effect.fromResult(Base64.decode(data)).pipe(
    Effect.mapError((cause) => invalid(`${label} contains invalid base64 data`, cause)),
    Effect.map((bytes) => Media.bytes(bytes, mediaType, options)),
  )


export const imageOutput = (
  invalid: (message: string, cause?: unknown) => AIError,
  label: string,
  item: { readonly b64_json?: string | null; readonly url?: string | null },
  mediaType: string | undefined,
  options?: Media.AssetOptions,
) => {
  if (item.b64_json) return decodedAsset(invalid, label, item.b64_json, mediaType, options)
  if (item.url) return Effect.succeed(Media.url(item.url, { ...options, mediaType }))
  return Effect.fail(invalid(`${label} has neither image data nor a URL`))
}


export const appendFields = (
  form: FormData,
  fields: Record<string, unknown>,
  options: {
    readonly overlay?: Record<string, unknown>
    readonly reserved: ReadonlySet<string>
    readonly repeatArrays?: "key[]" | "key"
  },
) => {
  const overlay = Object.entries(options.overlay ?? {}).filter(([key]) => !options.reserved.has(key))
  Object.entries(mergeJsonRecords(fields, Object.fromEntries(overlay)) ?? {}).forEach(([key, value]) => {
    if (Array.isArray(value) && value.every(isScalar) && options.repeatArrays !== undefined)
      return value.forEach((item) => form.append(options.repeatArrays === "key[]" ? `${key}[]` : key, String(item)))
    form.append(key, typeof value === "string" ? value : encodeJson(value))
  })
}

export * as MediaInput from "./media-input.js"

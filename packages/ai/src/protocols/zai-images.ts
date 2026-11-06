import { Duration, Effect, Schema } from "effect"
import type { HttpClientResponse } from "effect/http"
import { ImageModel, ImageResponse, type ImageRequestFor } from "../image.js"
import { MediaProtocol } from "../route/media-protocol.js"
import { MediaRoute } from "../route/media.js"
import { mergeJsonRecords, type OpenString } from "../schema/index.js"

const route = MediaProtocol.identity({ id: "zai-images", name: "Z.invalid Images", provider: "zai" })
export const DEFAULT_BASE_URL = "https://api.z.invalid/api/paas/v4"
export const PATH = "/images/generations"
const OUTPUT_RETENTION = Duration.days(30)






export type ZAIImageOptions = {
  readonly quality?: OpenString<"hd" | "standard">
  readonly userID?: string
} & Record<string, unknown>

export type Request = ImageRequestFor<ZAIImageOptions>





const ZAIImageResponse = Schema.Struct({
  created: Schema.optional(Schema.Int),
  id: Schema.optional(Schema.String),
  request_id: Schema.optional(Schema.String),
  data: Schema.Array(Schema.Struct({ url: Schema.String })),
  content_filter: Schema.optional(
    Schema.Array(
      Schema.Struct({
        role: Schema.optional(Schema.String),
        level: Schema.optional(Schema.Number),
      }),
    ),
  ),
})





const nativeOptions = (options: ZAIImageOptions | undefined) => {
  if (!options) return undefined
  const { userID, ...native } = options
  return { user_id: userID, ...native }
}

const fromRequest = Effect.fn("ZAIImages.fromRequest")(function* (request: Request) {
  return MediaProtocol.json(
    mergeJsonRecords(
      { model: request.model.id, prompt: request.prompt, size: request.size },
      nativeOptions(request.providerOptions),
      request.http?.body,
    ) ?? {},
  )
})





const decodeDocument = route.decodeJson(ZAIImageResponse)

const decodeResponse = Effect.fn("ZAIImages.decodeResponse")(function* (
  response: HttpClientResponse.HttpClientResponse,
) {
  const output = yield* decodeDocument(response)
  const decoded = output.value
  if (decoded.data.length === 0) return yield* output.invalid(`${route.name} returned no images`)
  const filters = decoded.content_filter ?? []
  return new ImageResponse({
    
    images: yield* Effect.forEach(decoded.data, (item) => MediaProtocol.expiringUrl(item.url, OUTPUT_RETENTION)),
    
    notices:
      filters.length === 0
        ? undefined
        : filters.map((filter) => ({
            type: "moderated" as const,
            message: `${route.name} applied a content filter${filter.role === undefined ? "" : ` for ${filter.role}`}${
              filter.level === undefined ? "" : ` at level ${filter.level}`
            }`,
            providerMetadata: { zai: filter },
          })),
    providerMetadata: {
      zai: {
        created: decoded.created,
        id: decoded.id,
        requestID: decoded.request_id,
        contentFilter: decoded.content_filter,
      },
    },
  })
})





export const protocol = MediaProtocol.inline<Request, ImageResponse>(route, {
  unsupported: ["images", "mask", "n", "aspectRatio", "seed", "format"],
  body: { from: fromRequest },
  response: { decode: decodeResponse },
})

export const model = (input: MediaRoute.ModelInput) =>
  ImageModel.fromRoute<ZAIImageOptions>({ protocol, baseURL: DEFAULT_BASE_URL, path: PATH }, input)

export const ZAIImages = {
  protocol,
  model,
} as const

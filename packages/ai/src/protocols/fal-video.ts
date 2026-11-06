import { Effect, Schema } from "effect"
import type { HttpClientResponse } from "effect/http"
import { Media } from "../media.js"
import { MediaProtocol } from "../route/media-protocol.js"
import { MediaRoute } from "../route/media.js"
import { mergeJsonRecords, type OpenString } from "../schema/index.js"
import { VideoModel, VideoResponse, type VideoRequestFor } from "../video.js"
import { optionalNull } from "./shared.js"
import { FalQueue } from "./utils/fal-queue.js"

const route = MediaProtocol.identity({ id: "fal-video", name: "fal Video", provider: "fal" })






export type FalVideoOptions = {
  readonly duration?: OpenString<"4s" | "6s" | "8s" | "5" | "10">
} & Record<string, unknown>

export type Request = VideoRequestFor<FalVideoOptions>





const QueueResult = Schema.StructWithRest(
  Schema.Struct({
    video: Schema.Struct({
      url: Schema.String,
      content_type: optionalNull(Schema.String),
      file_name: optionalNull(Schema.String),
      file_size: optionalNull(Schema.Number),
    }),
    seed: optionalNull(Schema.Number),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
)





const fromRequest = Effect.fn("FalVideo.fromRequest")(function* (request: Request) {
  if (request.frames?.last !== undefined)
    return yield* route.unsupported(
      "video.frames.last",
      `${route.name} names the last frame per model; pass it through providerOptions (e.g. end_image_url) instead of frames.last`,
    )
  const imageUrl =
    request.frames?.first === undefined ? undefined : yield* FalQueue.mediaUrl(request.frames.first, route.name)
  const videoUrl = request.video === undefined ? undefined : yield* FalQueue.mediaUrl(request.video, route.name)
  return MediaProtocol.json(
    mergeJsonRecords(
      {
        prompt: request.prompt,
        negative_prompt: request.negativePrompt,
        seed: request.seed,
        aspect_ratio: request.aspectRatio,
        resolution: request.resolution,
        generate_audio: request.audio,
        image_url: imageUrl,
        video_url: videoUrl,
      },
      request.providerOptions,
      request.http?.body,
    ) ?? {},
  )
})





const decodeQueueResult = route.decodeJson(QueueResult)

const decodeResult = Effect.fn("FalVideo.decodeResult")(function* (
  response: HttpClientResponse.HttpClientResponse,
  context: MediaProtocol.PollContext<FalQueue.Token>,
) {
  const output = yield* decodeQueueResult(response)
  const { video, seed, ...rest } = output.value
  return new VideoResponse({
    videos: [Media.url(video.url, { mediaType: video.content_type ?? "video/mp4" })],
    providerMetadata: {
      fal: {
        requestId: context.token.requestID,
        seed: seed ?? undefined,
        fileName: video.file_name ?? undefined,
        fileSize: video.file_size ?? undefined,
        ...rest,
      },
    },
  })
})





export const protocol = FalQueue.protocol<Request, VideoResponse>(route, {
  unsupported: ["n", "durationSeconds", "references"],
  from: fromRequest,
  decodeResult,
})

export const model = (input: MediaRoute.ModelInput) =>
  VideoModel.fromRoute<FalVideoOptions, FalQueue.Token>(
    { protocol, baseURL: FalQueue.DEFAULT_BASE_URL, path: ({ request }) => `/${request.model.id}` },
    input,
  )

export const FalVideo = {
  protocol,
  model,
} as const

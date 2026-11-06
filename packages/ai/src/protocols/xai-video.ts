import { Effect, Schema } from "effect"
import type { HttpClientResponse } from "effect/http"
import type { Status } from "../generation.js"
import { Media } from "../media.js"
import { MediaProtocol } from "../route/media-protocol.js"
import { MediaRoute } from "../route/media.js"
import { mergeJsonRecords } from "../schema/index.js"
import { VideoModel, VideoResponse, type VideoRequestFor } from "../video.js"
import { ProviderShared, optionalNull } from "./shared.js"

const route = MediaProtocol.identity({ id: "xai-video", name: "xAI Video", provider: "xai" })
export const DEFAULT_BASE_URL = "https://api.x.invalid/v1"
export const PATH = "/videos/generations"
export const EDIT_PATH = "/videos/edits"
export const EXTEND_PATH = "/videos/extensions"
export const STATUS_PATH = "/videos"






export type XAIVideoOptions = {
  readonly mode?: "edit" | "extend"
  readonly reference_audios?: ReadonlyArray<{ readonly voice_id: string }>
} & Record<string, unknown>

export type Request = VideoRequestFor<XAIVideoOptions>





export const Token = Schema.Struct({ requestID: Schema.String })
export type Token = Schema.Schema.Type<typeof Token>

const StartResponse = Schema.Struct({ request_id: Schema.String })

const VideoStatus = Schema.Struct({
  status: Schema.String,
  progress: optionalNull(Schema.Number),
  video: optionalNull(
    Schema.Struct({
      url: optionalNull(Schema.String),
      duration: optionalNull(Schema.Number),
      respect_moderation: optionalNull(Schema.Boolean),
    }),
  ),
  error: optionalNull(
    Schema.Struct({
      code: optionalNull(Schema.String),
      message: optionalNull(Schema.String),
    }),
  ),
  model: optionalNull(Schema.String),
})

const STATUS = {
  pending: "running",
  done: "completed",
  failed: "failed",
  expired: "expired",
} as const satisfies Record<string, Status>


const FAILURE = {
  invalid_argument: "InvalidRequest",
  failed_precondition: "InvalidRequest",
  permission_denied: "Authentication",
} as const satisfies Record<string, MediaProtocol.Failure>





const mediaInput = (asset: Media.Asset) =>
  ProviderShared.mediaReference(asset, route.provider, route.name).pipe(
    Effect.map((reference) => (reference.type === "ref" ? { file_id: reference.value } : { url: reference.value })),
  )

const nativeOptions = (options: XAIVideoOptions | undefined) => {
  if (!options) return undefined
  const { mode: _mode, ...native } = options
  return native
}

const fromRequest = Effect.fn("XAIVideo.fromRequest")(function* (request: Request) {
  const image = request.frames?.first === undefined ? undefined : yield* mediaInput(request.frames.first)
  const lastFrame = request.frames?.last === undefined ? undefined : yield* mediaInput(request.frames.last)
  const video = request.video === undefined ? undefined : yield* mediaInput(request.video)
  const references = yield* Effect.forEach(request.references ?? [], mediaInput)
  return MediaProtocol.json(
    mergeJsonRecords(
      {
        model: request.model.id,
        prompt: request.prompt,
        image,
        last_frame: lastFrame,
        reference_images: references.length === 0 ? undefined : references,
        video,
        duration: request.durationSeconds,
        aspect_ratio: request.aspectRatio,
        resolution: request.resolution,
        generate_audio: request.audio,
      },
      nativeOptions(request.providerOptions),
      request.http?.body,
    ) ?? {},
  )
})





const decodeStart = route.decodeStarted(StartResponse, (value) => ({
  token: { requestID: value.request_id },
  snapshot: { id: value.request_id, status: "running" },
}))


const fraction = (progress: number | null | undefined) =>
  progress !== undefined && progress !== null && progress >= 0 && progress <= 100 ? progress / 100 : undefined

const decodeVideoStatus = route.decodeJson(VideoStatus)

const decodeStatus = Effect.fn("XAIVideo.decodeStatus")(function* (
  response: HttpClientResponse.HttpClientResponse,
  context: MediaProtocol.PollContext<Token>,
) {
  const output = yield* decodeVideoStatus(response)
  const status = yield* MediaProtocol.status(STATUS, output.value.status, output)
  return { id: context.token.requestID, status, progress: fraction(output.value.progress) }
})

const decodeResult = Effect.fn("XAIVideo.decodeResult")(function* (
  response: HttpClientResponse.HttpClientResponse,
  context: MediaProtocol.PollContext<Token>,
) {
  const output = yield* decodeVideoStatus(response)
  const decoded = output.value
  const status = yield* MediaProtocol.status(STATUS, decoded.status, output)
  if (status === "running") return yield* output.pending(context.token.requestID)
  if (status === "failed") {
    const code = decoded.error?.code ?? undefined
    const message = decoded.error?.message ?? undefined
    return yield* output.ended(
      "failed",
      `${route.name} generation failed${code === undefined ? "" : ` (${code})`}${message === undefined ? "" : `: ${message}`}`,
      MediaProtocol.failure(FAILURE, code),
    )
  }
  if (status !== "completed")
    return yield* output.ended("expired", `${route.name} request ${context.token.requestID} expired`)
  
  const notices =
    decoded.video?.respect_moderation === false
      ? [{ type: "moderated" as const, message: `${route.name} flagged the generated video for moderation` }]
      : undefined
  const url = decoded.video?.url ?? undefined
  if (url === undefined && notices !== undefined)
    return yield* output.contentPolicy(`${route.name} withheld the video for moderation`)
  if (url === undefined) return yield* output.invalid(`${route.name} completed without a video URL`)
  const duration = decoded.video?.duration ?? undefined
  return new VideoResponse({
    videos: [
      Media.url(url, {
        mediaType: "video/mp4",
        info: duration === undefined ? undefined : { durationSeconds: duration },
      }),
    ],
    notices,
    providerMetadata: { xai: { requestId: context.token.requestID, model: decoded.model ?? undefined } },
  })
})





const statusPath = (token: Token) => `${STATUS_PATH}/${token.requestID}`

export const protocol = MediaProtocol.queued<Request, VideoResponse, Token>(route, {
  token: Token,
  unsupported: ["n", "seed", "negativePrompt"],
  start: { body: { from: fromRequest }, decode: decodeStart },
  status: { path: statusPath, decode: decodeStatus },
  result: { path: statusPath, decode: decodeResult },
})


const startPath = (request: Request) => {
  if (request.video === undefined) return PATH
  return request.providerOptions?.mode === "extend" ? EXTEND_PATH : EDIT_PATH
}

export const model = (input: MediaRoute.ModelInput) =>
  VideoModel.fromRoute<XAIVideoOptions, Token>(
    {
      protocol,
      baseURL: DEFAULT_BASE_URL,
      path: ({ request }) => startPath(request),
    },
    input,
  )

export const XAIVideo = {
  protocol,
  model,
} as const

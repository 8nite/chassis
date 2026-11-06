import { Layer } from "effect"
import { ImageClient } from "./image-client.js"
import { LLMClient } from "./route/client.js"
import { RequestExecutor } from "./route/executor.js"
import { SpeechClient } from "./speech-client.js"
import { TranscriptionClient } from "./transcription-client.js"
import { VideoClient } from "./video-client.js"


export const layerWith = <E, R>(executor: Layer.Layer<RequestExecutor.Service, E, R>) =>
  Layer.mergeAll(
    LLMClient.layer,
    ImageClient.layer,
    VideoClient.layer,
    SpeechClient.layer,
    TranscriptionClient.layer,
  ).pipe(Layer.provideMerge(executor))


export const layer = layerWith(RequestExecutor.fetchLayer)

export type Services = Layer.Success<typeof layer>

export * as AIClient from "./ai-client.js"

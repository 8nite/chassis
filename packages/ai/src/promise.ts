import { Effect, Layer, ManagedRuntime, Stream } from "effect"
import { AIClient } from "./ai-client.js"
import type { AwaitOptions, Event, Generation, Snapshot } from "./generation.js"
import { Image, type ImageModel, type ImageRequest, type ImageRequestInput } from "./image.js"
import { LLM } from "./index.js"
import { Media } from "./media.js"
import { tryRequest } from "./media-model.js"
import { RequestExecutor } from "./route/executor.js"
import { AIError, InvalidRequestError, LanguageModel, LLMRequest } from "./schema/index.js"
import type { RequestInput } from "./llm.js"
import { Speech, type SpeechModel, type SpeechRequest, type SpeechRequestInput } from "./speech.js"
import {
  Transcription,
  type TranscriptionModel,
  type TranscriptionRequest,
  type TranscriptionRequestInput,
} from "./transcription.js"
import { fileMediaType } from "./utils/media-type.js"
import { Video, type VideoModel, type VideoRequest, type VideoRequestInput } from "./video.js"


export interface Options {
  
  readonly layer?: Layer.Layer<RequestExecutor.Service>
}

export interface RunOptions {
  readonly signal?: AbortSignal
}

export type Services = AIClient.Services


export type GenerationHandle<Response> = Snapshot & {
  
  readonly token: unknown
  readonly await: (options?: AwaitOptions & RunOptions) => Promise<Response>
  
  readonly events: (options?: AwaitOptions & RunOptions) => AsyncIterable<Event>
  
  readonly result: (options?: RunOptions) => Promise<Response>
  readonly refresh: (options?: RunOptions) => Promise<GenerationHandle<Response>>
  readonly cancel: (options?: RunOptions) => Promise<void>
}


const abortEffect = (signal: AbortSignal | undefined) =>
  signal === undefined
    ? Effect.never
    : Effect.callback<never, unknown>((resume) => {
        if (signal.aborted) {
          resume(Effect.fail(signal.reason))
          return
        }
        const onAbort = () => resume(Effect.fail(signal.reason))
        signal.addEventListener("abort", onAbort, { once: true })
        return Effect.sync(() => signal.removeEventListener("abort", onAbort))
      })

export const make = (options: Options = {}) => {
  const runtime = ManagedRuntime.make(AIClient.layerWith(options.layer ?? RequestExecutor.fetchLayer))

  
  const run = <A, E>(effect: Effect.Effect<A, E, Services>, options?: RunOptions) =>
    runtime.runPromise(Effect.raceFirst(effect, abortEffect(options?.signal)))

  const iterate = <A, E>(stream: Stream.Stream<A, E, Services>, options?: RunOptions): AsyncIterable<A> =>
    Stream.toAsyncIterable(
      Stream.unwrap(
        runtime.contextEffect.pipe(
          Effect.map(
            (context): Stream.Stream<A, unknown> =>
              stream.pipe(Stream.interruptWhen(abortEffect(options?.signal)), Stream.provideContext(context)),
          ),
        ),
      ),
    )

  const handle = <Response>(generation: Generation<Response>): GenerationHandle<Response> => ({
    ...generation.snapshot,
    token: generation.token,
    await: (options) => run(generation.await({ poll: options?.poll }), options),
    events: (options) => iterate(generation.events({ poll: options?.poll }), options),
    result: (options) => run(generation.result(), options),
    refresh: (options) => run(generation.refresh(), options).then(handle),
    cancel: (options) => run(generation.cancel(), options),
  })

  const llmRequest = (input: RequestInput | LLMRequest) =>
    input instanceof LLMRequest ? Effect.succeed(input) : tryRequest(() => LLM.request(input))

  return {
    run,
    
    bytes: (asset: Media.Asset, options?: RunOptions) => run(asset.bytes(), options),
    base64: (asset: Media.Asset, options?: RunOptions) => run(asset.base64(), options),
    
    materialize: (asset: Media.Asset, options?: RunOptions) => run(asset.materialize(), options),
    
    file: async (path: string, options?: Media.AssetOptions & RunOptions) => {
      const { readFile } = await import("node:fs/promises")
      return run(
        Effect.tryPromise({
          try: (signal) => readFile(path, { signal }),
          catch: (cause) => fileError(`Failed to read media file ${path}`, cause),
        }).pipe(
          Effect.map((buffer) => {
            const data = new Uint8Array(buffer)
            return Media.bytes(data, fileMediaType(data, path), options)
          }),
        ),
        options,
      )
    },
    
    write: async (asset: Media.Asset, path: string, options?: RunOptions) => {
      const { writeFile } = await import("node:fs/promises")
      return run(
        asset.bytes().pipe(
          Effect.flatMap((data) =>
            Effect.tryPromise({
              try: (signal) => writeFile(path, data, { signal }),
              catch: (cause) => fileError(`Failed to write media file ${path}`, cause),
            }),
          ),
        ),
        options,
      )
    },
    llm: {
      request: LLM.request,
      generate: <const Model extends LanguageModel>(input: RequestInput<Model> | LLMRequest, options?: RunOptions) =>
        run(Effect.flatMap(llmRequest(input), LLM.generate), options),
      stream: <const Model extends LanguageModel>(input: RequestInput<Model> | LLMRequest, options?: RunOptions) =>
        iterate(Stream.unwrap(Effect.map(llmRequest(input), LLM.stream)), options),
    },
    image: {
      request: Image.request,
      generate: <const Model extends ImageModel>(
        input: ImageRequestInput<Model> | ImageRequest,
        options?: AwaitOptions & RunOptions,
      ) => run(Image.generate(input, { poll: options?.poll }), options),
      stream: <const Model extends ImageModel>(
        input: ImageRequestInput<Model> | ImageRequest,
        options?: AwaitOptions & RunOptions,
      ) => iterate(Image.stream(input, { poll: options?.poll }), options),
      start: <const Model extends ImageModel>(input: ImageRequestInput<Model> | ImageRequest, options?: RunOptions) =>
        run(Image.start(input), options).then(handle),
      resume: (model: ImageModel, token: unknown, options?: RunOptions) =>
        run(Image.resume(model, token), options).then(handle),
    },
    video: {
      request: Video.request,
      start: <const Model extends VideoModel>(input: VideoRequestInput<Model> | VideoRequest, options?: RunOptions) =>
        run(Video.start(input), options).then(handle),
      generate: <const Model extends VideoModel>(
        input: VideoRequestInput<Model> | VideoRequest,
        options?: AwaitOptions & RunOptions,
      ) => run(Video.generate(input, { poll: options?.poll }), options),
      resume: (model: VideoModel, token: unknown, options?: RunOptions) =>
        run(Video.resume(model, token), options).then(handle),
      stream: <const Model extends VideoModel>(
        input: VideoRequestInput<Model> | VideoRequest,
        options?: AwaitOptions & RunOptions,
      ) => iterate(Video.stream(input, { poll: options?.poll }), options),
    },
    speech: {
      request: Speech.request,
      generate: <const Model extends SpeechModel>(
        input: SpeechRequestInput<Model> | SpeechRequest,
        options?: RunOptions,
      ) => run(Speech.generate(input), options),
      stream: <const Model extends SpeechModel>(
        input: SpeechRequestInput<Model> | SpeechRequest,
        options?: RunOptions,
      ) => iterate(Speech.stream(input), options),
    },
    transcription: {
      request: Transcription.request,
      generate: <const Model extends TranscriptionModel>(
        input: TranscriptionRequestInput<Model> | TranscriptionRequest,
        options?: AwaitOptions & RunOptions,
      ) => run(Transcription.generate(input, { poll: options?.poll }), options),
      stream: <const Model extends TranscriptionModel>(
        input: TranscriptionRequestInput<Model> | TranscriptionRequest,
        options?: AwaitOptions & RunOptions,
      ) => iterate(Transcription.stream(input, { poll: options?.poll }), options),
      start: <const Model extends TranscriptionModel>(
        input: TranscriptionRequestInput<Model> | TranscriptionRequest,
        options?: RunOptions,
      ) => run(Transcription.start(input), options).then(handle),
      resume: (model: TranscriptionModel, token: unknown, options?: RunOptions) =>
        run(Transcription.resume(model, token), options).then(handle),
    },
    dispose: () => runtime.dispose(),
  }
}

export type Client = ReturnType<typeof make>

const fileError = (message: string, cause: unknown) =>
  new AIError({ reason: new InvalidRequestError({ message, cause }) })


export const ai = make()

export * as AI from "./promise.js"

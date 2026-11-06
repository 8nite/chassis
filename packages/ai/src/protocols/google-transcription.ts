import { Effect, Schema, SchemaGetter } from "effect"
import { MediaProtocol } from "../route/media-protocol.js"
import { MediaRoute } from "../route/media.js"
import { mergeJsonRecords, type OpenString } from "../schema/index.js"
import {
  TranscriptionFinishEvent,
  TranscriptionModel,
  TranscriptionSegmentEvent,
  TranscriptionTextDeltaEvent,
  type TranscriptionRequestFor,
  type TranscriptionSegment,
  type TranscriptionWord,
  type TranscriptionEvent,
} from "../transcription.js"
import { GeminiGenerateContent } from "./utils/gemini-generate-content.js"

const route = MediaProtocol.identity({ id: "google-transcription", name: "Google Transcription", provider: "google" })
export const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"






export type GoogleTranscriptionOptions = {
  readonly audioTranscriptionConfig?: {
    readonly mode?: OpenString<"VERBATIM" | "SMART">
    readonly customVocabulary?: ReadonlyArray<string>
    readonly languageCodes?: ReadonlyArray<string>
  }
} & Record<string, unknown>

export type Request = TranscriptionRequestFor<GoogleTranscriptionOptions>





const Seconds = Schema.String.check(Schema.isPattern(/^\d+(\.\d+)?s$/)).pipe(
  Schema.decodeTo(Schema.Number, {
    decode: SchemaGetter.transform((value) => Number.parseFloat(value)),
    encode: SchemaGetter.transform((value) => `${value}s`),
  }),
)

const AudioTranscription = Schema.Struct({
  text: Schema.String,
  speakerLabel: Schema.optional(Schema.String),
  words: Schema.optional(
    Schema.Array(
      Schema.Struct({
        word: Schema.String,
        startOffset: Seconds,
        endOffset: Seconds,
        speakerLabel: Schema.optional(Schema.String),
      }),
    ),
  ),
})

const decodeChunk = route.decodeFrame(
  GeminiGenerateContent.chunk(Schema.Struct({ audioTranscription: Schema.optional(AudioTranscription) })),
)





interface State extends GeminiGenerateContent.Metadata {
  readonly text: string
  readonly segments: Array<TranscriptionSegment>
  readonly words: Array<TranscriptionWord>
}





const fromRequest = Effect.fn("GoogleTranscription.fromRequest")(function* (request: MediaProtocol.Addressed<Request>) {
  
  if (!request.model.id.includes("transcribe"))
    return yield* route.unsupported(
      "transcription.model",
      `${request.model.id} is not a transcription model; use a transcribe model such as gemini-3.5-transcribe`,
    )
  return MediaProtocol.json(
    mergeJsonRecords(
      {
        contents: [{ role: "user", parts: [yield* GeminiGenerateContent.mediaPart(route.id, request.audio)] }],
        generationConfig: mergeJsonRecords(
          {
            audioTranscriptionConfig: {
              languageCodes: request.language === undefined ? undefined : [request.language],
              
              wordTimestamp:
                request.diarize === true || request.timestamps === "word" || request.timestamps === "segment"
                  ? true
                  : undefined,
              diarization: request.diarize === true ? true : undefined,
            },
          },
          request.providerOptions,
        ),
      },
      request.http?.body,
    ) ?? {},
  )
})





const turn = (part: Schema.Schema.Type<typeof AudioTranscription>) => {
  const words = (part.words ?? []).map((word) => ({
    text: word.word,
    startSeconds: word.startOffset,
    endSeconds: word.endOffset,
    speaker: word.speakerLabel ?? part.speakerLabel,
  }))
  const first = words[0]
  const last = words.at(-1)
  return {
    text: part.text,
    words,
    segment:
      first === undefined || last === undefined
        ? undefined
        : {
            text: part.text,
            startSeconds: first.startSeconds,
            endSeconds: last.endSeconds,
            speaker: part.speakerLabel,
          },
  }
}

const step = Effect.fnUntraced(function* (state: State, frame: string) {
  const chunk = yield* decodeChunk(frame)
  const blocked = GeminiGenerateContent.blocked(route.name, chunk, frame)
  if (blocked !== undefined) return yield* blocked
  const turns = (chunk.candidates?.[0]?.content?.parts ?? []).flatMap((part) =>
    part.audioTranscription === undefined ? [] : [turn(part.audioTranscription)],
  )
  const segments = turns.flatMap((item) => (item.segment === undefined ? [] : [item.segment]))
  state.words.push(...turns.flatMap((item) => item.words))
  state.segments.push(...segments)
  
  const text = turns
    .map((item) => item.text)
    .filter((item) => item.length > 0)
    .join(" ")
  const delta = text.length === 0 || state.text.length === 0 ? text : ` ${text}`
  const withheld =
    state.text.length + delta.length === 0 ? GeminiGenerateContent.withheld(route.name, chunk, frame) : undefined
  if (withheld !== undefined) return yield* withheld
  const events: ReadonlyArray<TranscriptionEvent> = [
    ...(delta.length === 0 ? [] : [TranscriptionTextDeltaEvent.make({ delta })]),
    ...segments.map((segment) => TranscriptionSegmentEvent.make({ segment })),
  ]
  return [{ ...GeminiGenerateContent.track(state, chunk), text: state.text + delta }, events] as const
})

const finish = (state: State) => {
  if (state.finishReason === undefined) return Effect.fail(route.incomplete())
  return Effect.succeed([
    TranscriptionFinishEvent.make({
      text: state.text,
      segments: state.segments.length === 0 ? undefined : state.segments,
      words: state.words.length === 0 ? undefined : state.words,
      usage: GeminiGenerateContent.usage(state.usage),
      notices: GeminiGenerateContent.notices(route.name, state),
      providerMetadata: GeminiGenerateContent.providerMetadata(state),
    }),
  ])
}





export const protocol = MediaProtocol.stream<Request, TranscriptionEvent, string, State>(route, {
  unsupported: ["prompt", "speakers"],
  body: { from: fromRequest },
  frames: (bytes, context) => GeminiGenerateContent.frames(bytes, context.request.mode),
  initial: () => ({ text: "", segments: [], words: [] }),
  step,
  finish,
})

export const model = (input: MediaRoute.ModelInput) =>
  TranscriptionModel.fromRoute<GoogleTranscriptionOptions, string, State>(
    {
      protocol,
      baseURL: DEFAULT_BASE_URL,
      path: ({ request }) => GeminiGenerateContent.path(request.model.id, request.mode),
    },
    input,
  )

export const GoogleTranscription = {
  protocol,
  model,
} as const

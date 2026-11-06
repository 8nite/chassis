import { EventStreamCodec } from "@smithy/eventstream-codec"
import { fromUtf8, toUtf8 } from "@smithy/util-utf8"
import { Effect, Stream } from "effect"
import { Base64 } from "effect/encoding"
import { AIError, AIErrorReason, InvalidProviderOutputError } from "../schema/index.js"
import { Framing } from "../route/framing.js"
import { ProviderShared } from "./shared.js"





const eventCodec = new EventStreamCodec(toUtf8, fromUtf8)
const utf8 = new TextDecoder()




interface FrameBufferState {
  readonly buffer: Uint8Array
  readonly offset: number
}

const initialFrameBuffer: FrameBufferState = { buffer: new Uint8Array(0), offset: 0 }

type FrameInput = { readonly _tag: "Chunk"; readonly bytes: Uint8Array } | { readonly _tag: "End" }

const endOfStream: FrameInput = { _tag: "End" }

const appendChunk = (state: FrameBufferState, chunk: Uint8Array): FrameBufferState => {
  const remaining = state.buffer.length - state.offset
  
  
  
  const next = new Uint8Array(remaining + chunk.length)
  next.set(state.buffer.subarray(state.offset), 0)
  next.set(chunk, remaining)
  return { buffer: next, offset: 0 }
}

const consumeFrames = (route: string) => (state: FrameBufferState, input: FrameInput) =>
  Effect.gen(function* () {
    if (input._tag === "End") {
      const remaining = state.buffer.subarray(state.offset)
      if (remaining.length > 0)
        return yield* new AIError({
          reason: new InvalidProviderOutputError({
            route,
            classification: "incomplete-stream",
            message: `Incomplete Bedrock Converse event-stream frame: ${remaining.length} buffered bytes remain at end of stream`,
            body: Base64.encode(remaining),
          }),
        })
      return [state, []] as const
    }

    let cursor = appendChunk(state, input.bytes)
    const out: object[] = []
    while (cursor.buffer.length - cursor.offset >= 4) {
      const view = cursor.buffer.subarray(cursor.offset)
      const totalLength = new DataView(view.buffer, view.byteOffset, view.byteLength).getUint32(0, false)
      if (view.length < totalLength) break

      const decoded = yield* Effect.try({
        try: () => eventCodec.decode(view.subarray(0, totalLength)),
        catch: (error) =>
          ProviderShared.eventError(
            route,
            `Failed to decode Bedrock Converse event-stream frame: ${
              error instanceof Error ? error.message : String(error)
            }`,
            Base64.encode(view.subarray(0, totalLength)),
            error,
          ),
      })
      cursor = { buffer: cursor.buffer, offset: cursor.offset + totalLength }

      const payload = utf8.decode(decoded.body)
      const body = ProviderShared.encodeJson({ headers: decoded.headers, body: payload })
      const messageType = decoded.headers[":message-type"]?.value
      if (messageType === "error") {
        const code = decoded.headers[":error-code"]?.value
        const message = decoded.headers[":error-message"]?.value
        return yield* ProviderShared.eventError(
          route,
          [code, message].filter((value): value is string => typeof value === "string").join(": ") ||
            "Bedrock Converse event-stream error",
          body,
        )
      }
      const eventType =
        messageType === "event"
          ? decoded.headers[":event-type"]?.value
          : messageType === "exception"
            ? decoded.headers[":exception-type"]?.value
            : undefined
      if (typeof eventType !== "string") continue
      if (!payload) continue
      
      
      
      
      const parsed = (yield* ProviderShared.parseJson(
        route,
        payload,
        "Failed to parse Bedrock Converse event-stream payload",
      ).pipe(
        Effect.mapError(
          (error) =>
            new AIError({
              reason: AIErrorReason.make({ ...error.reason, message: error.message, cause: error.reason.cause, body }),
            }),
        ),
      )) as Record<string, unknown>
      delete parsed.p
      out.push({
        ...(messageType === "exception"
          ? { exception: { type: eventType, details: parsed } }
          : { [eventType]: parsed }),
        rawBody: body,
      })
    }
    return [cursor, out] as const
  })


export const framing = (route: string): Framing.Definition<object> => ({
  id: "aws-event-stream",
  body: (frame) => ("rawBody" in frame && typeof frame.rawBody === "string" ? frame.rawBody : undefined),
  frame: (bytes) =>
    bytes.pipe(
      Stream.map((bytes): FrameInput => ({ _tag: "Chunk", bytes })),
      Stream.concat(Stream.succeed(endOfStream)),
      Stream.mapAccumEffect(() => initialFrameBuffer, consumeFrames(route)),
    ),
})

export * as BedrockEventStream from "./bedrock-event-stream.js"

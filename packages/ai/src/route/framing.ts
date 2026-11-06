import { Effect, Stream } from "effect"
import { makeParser } from "effect/encoding/Sse"
import { AIError, InvalidProviderOutputError } from "../schema/index.js"


export interface Definition<Frame> {
  readonly id: string
  readonly frame: (bytes: Stream.Stream<Uint8Array, AIError>) => Stream.Stream<Frame, AIError>
  
  readonly body?: (frame: Frame) => string | undefined
}


export const sseFraming = (
  bytes: Stream.Stream<Uint8Array, AIError>,
  events?: ReadonlySet<string>,
  includeDone = false,
): Stream.Stream<string, AIError> =>
  bytes.pipe(
    Stream.decodeText(),
    Stream.mapAccumEffect(
      () => {
        const output: string[] = []
        return {
          output,
          parser: makeParser((event) => {
            if (
              event._tag === "Event" &&
              (events === undefined || events.has(event.event)) &&
              event.data.length > 0 &&
              
              
              
              event.data !== "null" &&
              
              
              event.data !== ": keepalive" &&
              (event.data !== "[DONE]" || includeDone || (events !== undefined && event.event !== "message"))
            )
              output.push(event.data)
          }),
        }
      },
      (state, chunk) => {
        const error = state.parser.feed(chunk)
        if (!error) return Effect.succeed([state, state.output.splice(0)] as const)
        const reason = new InvalidProviderOutputError({
          route: "sse",
          message: error.message,
          body: chunk,
          cause: error,
        })
        return Effect.fail(new AIError({ reason }))
      },
    ),
  )


export const sse: Definition<string> = { id: "sse", frame: sseFraming }


export const sseWithDone: Definition<string> = {
  id: "sse",
  frame: (bytes) => sseFraming(bytes, undefined, true),
}


export const sseEvents = (events: ReadonlySet<string>): Definition<string> => ({
  id: "sse",
  frame: (bytes) => sseFraming(bytes, events),
})

export const lines: Definition<string> = {
  id: "lines",
  frame: (bytes) =>
    bytes.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.filter((line) => line.trim().length > 0),
    ),
}

export const document: Definition<string> = {
  id: "document",
  frame: (bytes) => Stream.fromEffect(Stream.mkString(bytes.pipe(Stream.decodeText()))),
}

export * as Framing from "./framing.js"

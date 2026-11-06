import { Schema, type Effect } from "effect"
import type { AIError, LanguageModelSanitizerCompatibility, LLMEvent, LLMRequest, ProtocolID } from "../schema/index.js"


export interface Protocol<Body, Frame, Event, State> {
  
  readonly id: ProtocolID
  
  readonly body: ProtocolBody<Body>
  
  readonly stream: ProtocolStream<Frame, Event, State>
  
  readonly supportsEffortUpdates?: (request: LLMRequest) => boolean
  
  readonly sanitizer?: LanguageModelSanitizerCompatibility
}

export interface ProtocolBody<Body> {
  
  readonly schema: Schema.Codec<Body, unknown>
  
  readonly from: (request: LLMRequest) => Effect.Effect<Body, AIError>
}

export interface ProtocolStream<Frame, Event, State> {
  
  readonly event: Schema.Codec<Event, Frame>
  
  readonly initial: (request: LLMRequest) => State
  
  readonly step: (state: State, event: Event) => Effect.Effect<readonly [State, ReadonlyArray<LLMEvent>], AIError>
  
  readonly terminal?: (event: Event) => boolean
  
  readonly onHalt?: (state: State) => Effect.Effect<ReadonlyArray<LLMEvent>, AIError>
}


export const make = <Body, Frame, Event, State>(
  input: Protocol<Body, Frame, Event, State>,
): Protocol<Body, Frame, Event, State> => input

export const jsonEvent = <const S extends Schema.Top>(schema: S) => Schema.fromJsonString(schema)

export * as Protocol from "./protocol.js"

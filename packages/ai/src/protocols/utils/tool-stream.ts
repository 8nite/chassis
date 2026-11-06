import { Effect, Option } from "effect"
import { AIError, LLMEvent, type ProviderMetadata, type ToolCall, type ToolInputError } from "../../schema/index.js"
import { eventError, parseToolInput, type ToolAccumulator } from "../shared.js"
import { parse } from "./partial-json.js"

type StreamKey = string | number
const parsePartialInput = Option.liftThrowable(parse)


export interface PendingTool extends ToolAccumulator {
  readonly providerExecuted?: boolean
  readonly providerMetadata?: ProviderMetadata
}


export type State<K extends StreamKey> = Partial<Record<K, PendingTool>>


export interface AppendOutcome<K extends StreamKey> {
  readonly tools: State<K>
  readonly tool: PendingTool
  readonly events: ReadonlyArray<LLMEvent>
}


export const empty = <K extends StreamKey>(): State<K> => ({})

const withTool = <K extends StreamKey>(tools: State<K>, key: K, tool: PendingTool): State<K> => {
  return { ...tools, [key]: tool }
}

const withoutTool = <K extends StreamKey>(tools: State<K>, key: K): State<K> => {
  const next = { ...tools }
  delete next[key]
  return next
}

const inputStart = (tool: PendingTool) =>
  LLMEvent.toolInputStart({
    id: tool.id,
    name: tool.name,
    namespace: tool.namespace,
    providerExecuted: tool.providerExecuted ? true : undefined,
    providerMetadata: tool.providerMetadata,
  })

const inputDelta = (tool: PendingTool, text: string): LLMEvent => {
  const raw = tool.input
  let parsed: unknown
  return {
    ...LLMEvent.toolInputDelta({
      id: tool.id,
      name: tool.name,
      namespace: tool.namespace,
      text,
    }),
    get input() {
      return (parsed ??= Option.getOrElse(parsePartialInput(raw), () => ({})))
    },
  }
}

const toolCall = (route: string, tool: PendingTool, inputOverride?: string) => {
  const raw = inputOverride ?? tool.input
  return parseToolInput(route, tool.name, raw).pipe(
    Effect.map(
      (input): ToolCall =>
        LLMEvent.toolCall({
          id: tool.id,
          name: tool.name,
          namespace: tool.namespace,
          input,
          providerExecuted: tool.providerExecuted ? true : undefined,
          providerMetadata: tool.providerMetadata,
        }),
    ),
    Effect.catch((error) =>
      tool.providerExecuted
        ? Effect.fail(error)
        : Effect.succeed(LLMEvent.toolInputError({ id: tool.id, name: tool.name, namespace: tool.namespace, raw })),
    ),
  )
}

const finishEvents = (tool: PendingTool, event: ToolCall | ToolInputError): ReadonlyArray<LLMEvent> => [
  LLMEvent.toolInputEnd({
    id: tool.id,
    name: tool.name,
    namespace: tool.namespace,
    providerMetadata: tool.providerMetadata,
  }),
  event,
]


const appendTool = <K extends StreamKey>(
  tools: State<K>,
  key: K,
  tool: PendingTool,
  text: string,
): AppendOutcome<K> => {
  const events: LLMEvent[] = []
  if (!tools[key]) events.push(inputStart(tool))
  if (text.length > 0) events.push(inputDelta(tool, text))
  return {
    tools: withTool(tools, key, tool),
    tool,
    events,
  }
}

export const isError = <K extends StreamKey>(result: AppendOutcome<K> | AIError): result is AIError =>
  result instanceof AIError


export const start = <K extends StreamKey>(
  tools: State<K>,
  key: K,
  tool: Omit<PendingTool, "input"> & { readonly input?: string },
) => withTool(tools, key, { ...tool, input: tool.input ?? "" })


export const appendOrStart = <K extends StreamKey>(
  route: string,
  tools: State<K>,
  key: K,
  delta: {
    readonly id?: string
    readonly name?: string
    readonly text: string
    readonly providerMetadata?: ProviderMetadata
  },
  missingToolMessage: string,
): AppendOutcome<K> | AIError => {
  const current = tools[key]
  const id = current?.id ?? delta.id
  const name = current?.name ?? delta.name
  if (!id || !name) return eventError(route, missingToolMessage)

  const tool = {
    id,
    name,
    namespace: current?.namespace,
    input: `${current?.input ?? ""}${delta.text}`,
    providerExecuted: current?.providerExecuted,
    providerMetadata: current?.providerMetadata ?? delta.providerMetadata,
  }
  if (current && delta.text.length === 0 && current.id === id && current.name === name)
    return { tools, tool: current, events: [] }
  return appendTool(tools, key, tool, delta.text)
}


export const append = <K extends StreamKey>(tools: State<K>, key: K, text: string): AppendOutcome<K> | undefined => {
  const current = tools[key]
  if (!current) return undefined
  if (text.length === 0) return { tools, tool: current, events: [] }
  return appendTool(tools, key, { ...current, input: `${current.input}${text}` }, text)
}


export const appendExisting = <K extends StreamKey>(
  route: string,
  tools: State<K>,
  key: K,
  text: string,
  missingToolMessage: string,
): AppendOutcome<K> | AIError => append(tools, key, text) ?? eventError(route, missingToolMessage)


export const finish = <K extends StreamKey>(route: string, tools: State<K>, key: K) =>
  Effect.gen(function* () {
    const tool = tools[key]
    if (!tool) return { tools }
    return {
      tools: withoutTool(tools, key),
      events: finishEvents(tool, yield* toolCall(route, tool)),
    }
  })


export const finishWithInput = <K extends StreamKey>(route: string, tools: State<K>, key: K, input: string) =>
  Effect.gen(function* () {
    const tool = tools[key]
    if (!tool) return { tools }
    return {
      tools: withoutTool(tools, key),
      events: finishEvents(tool, yield* toolCall(route, tool, input)),
    }
  })


export const finishAll = <K extends StreamKey>(route: string, tools: State<K>) =>
  Effect.gen(function* () {
    const pending = Object.values<PendingTool | undefined>(tools).filter(
      (tool): tool is PendingTool => tool !== undefined,
    )
    return {
      tools: empty<K>(),
      events: yield* Effect.forEach(pending, (tool) =>
        toolCall(route, tool).pipe(Effect.map((event) => finishEvents(tool, event))),
      ).pipe(Effect.map((events) => events.flat())),
    }
  })

export * as ToolStream from "./tool-stream.js"

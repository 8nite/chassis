import { Tool } from "@chassis/schema/tool"
import { Effect, Option, Schema } from "effect"
import { Headers, HttpClientRequest } from "effect/http"
import { Media } from "../media.js"
import {
  InvalidProviderOutputError,
  InvalidRequestError,
  UnsupportedOperationError,
  AIError,
  LLMRequest,
  Message,
  ToolDefinition,
  type ContentPart,
  type MediaPart,
  type OpenString,
  type ProviderID,
  type TextPart,
  type ToolEntry,
  type ToolResultPart,
} from "../schema/index.js"
import { Json, decodeJson, encodeJson } from "../utils/json.js"
import { isRecord } from "../utils/record.js"
export { Json, decodeJson, encodeJson, isRecord }

const isJson = Schema.is(Schema.Json)
export const JsonObject = Schema.Record(Schema.String, Schema.Unknown)
export const optionalArray = <const S extends Schema.Top>(schema: S) => Schema.optional(Schema.Array(schema))
export const optionalNull = <const S extends Schema.Top>(schema: S) => Schema.optional(Schema.NullOr(schema))

export const lenient = <const S extends Schema.Top>(schema: S) =>
  Schema.optionalKey(
    Schema.UndefinedOr(schema).pipe(Schema.catchDecoding(() => Effect.succeed(Option.some(undefined)))),
  )

export const knownString = <Known extends string>() =>
  Schema.declare<OpenString<Known>>((value): value is OpenString<Known> => typeof value === "string", {
    expected: "string",
  })

export const OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH = 64



export const promptCacheKey = (request: LLMRequest): string | undefined => {
  if (request.cache === "none" || request.promptCacheKey === undefined) return undefined
  const chars = Array.from(request.promptCacheKey)
  if (chars.length <= OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH) return request.promptCacheKey
  return chars.slice(0, OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH).join("")
}


export interface ToolAccumulator {
  readonly id: string
  readonly name: string
  readonly namespace?: string
  readonly input: string
}


export const totalTokens = (
  inputTokens: number | undefined,
  outputTokens: number | undefined,
  total: number | undefined,
) => {
  if (total !== undefined) return total
  if (inputTokens === undefined && outputTokens === undefined) return undefined
  return (inputTokens ?? 0) + (outputTokens ?? 0)
}


export const subtractTokens = (total: number | undefined, subtrahend: number | undefined): number | undefined => {
  if (total === undefined) return undefined
  if (subtrahend === undefined) return total
  return Math.max(0, total - subtrahend)
}


export const sumTokens = (...values: ReadonlyArray<number | undefined>): number | undefined => {
  if (values.every((value) => value === undefined)) return undefined
  return values.reduce((acc: number, value) => acc + (value ?? 0), 0)
}


export const fitThinkingBudget = (budget: number, maxTokens: number | undefined, minimum = 1) =>
  maxTokens === undefined || budget <= maxTokens / 2 ? budget : Math.max(minimum, Math.floor(maxTokens / 2))

export const eventError = (route: string, message: string, body?: string, cause?: unknown) =>
  new AIError({
    reason: new InvalidProviderOutputError({ route, message, body, cause }),
  })

export const parseJson = (route: string, input: string, message: string) =>
  Effect.try({
    try: () => decodeJson(input),
    catch: (cause) => eventError(route, message, input, cause),
  })


export const joinText = (parts: ReadonlyArray<{ readonly text: string }>) => parts.map((part) => part.text).join("\n")

const escapeSystemUpdateText = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")


export const wrapSystemUpdate = (parts: ReadonlyArray<{ readonly text: string }>) =>
  `<system-update>\n${escapeSystemUpdateText(joinText(parts))}\n</system-update>`


export const systemUpdateText = Effect.fnUntraced(function* (
  route: string,
  message: LLMRequest["messages"][number],
) {
  const content: TextPart[] = []
  for (const part of message.content) {
    if (!supportsContent(part, ["text"])) return yield* unsupportedContent(route, "system", ["text"])
    content.push(part)
  }
  return content
})


export const wrappedSystemUpdate = Effect.fnUntraced(function* (
  route: string,
  message: LLMRequest["messages"][number],
) {
  const content = yield* systemUpdateText(route, message)
  return { type: "text" as const, text: wrapSystemUpdate(content), cache: content.at(-1)?.cache }
})


export const parseToolInput = (route: string, name: string, raw: string) =>
  parseJson(route, raw || "{}", `Invalid JSON input for ${route} tool call ${name}`)


export const requireInlineMedia = (route: string, asset: Media.Asset): Effect.Effect<Media.Inline, AIError> => {
  const inline = asset.inline()
  return inline ? Effect.succeed(inline) : Effect.fail(inlineRequired(route, asset))
}

export const inlineRequired = (route: string, asset: Media.Asset) =>
  invalidRequest(
    `${route} requires inline media (bytes or base64); ${asset.source.type} sources must be materialized first`,
  )


export const mediaUrl = (asset: Media.Asset) => (asset.source.type === "url" ? asset.source.url : undefined)

export type MediaReference = { readonly type: "dataUrl" | "url" | "ref"; readonly value: string }


export const mediaReference = (
  asset: Media.Asset,
  provider: ProviderID | undefined,
  label: string,
): Effect.Effect<MediaReference, AIError> => {
  const inline = asset.inline()
  if (inline) return Effect.succeed({ type: "dataUrl", value: inline.dataUrl })
  const url = mediaUrl(asset)
  if (url) return Effect.succeed({ type: "url", value: url })
  if (provider !== undefined && asset.source.type === "ref" && asset.source.provider === provider)
    return Effect.succeed({ type: "ref", value: asset.source.id })
  const accepted = provider === undefined ? "" : `, and ${provider} references`
  const got = asset.source.type === "ref" ? `; got ${asset.source.provider}:${asset.source.id}` : ""
  return Effect.fail(invalidRequest(`${label} accepts inline bytes, data URLs, http(s) URLs${accepted}${got}`))
}


export const toolFileMedia = (item: Tool.FileContent): MediaPart => {
  const parsed = Media.parseDataUrl(item.uri)
  const asset = parsed
    ? Media.from({ ...parsed.source, mediaType: item.mime })
    : /^https?:\/\//.test(item.uri)
      ? Media.url(item.uri, { mediaType: item.mime })
      : Media.base64(item.uri, item.mime)
  return Message.media(asset, { filename: item.name })
}

export const toolResultText = (part: ToolResultPart) => {
  if (part.result.type === "text") return String(part.result.value)
  if (part.result.type === "error") {
    const value = part.result.value
    const prototype =
      typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value)
    const structured = Array.isArray(value) || prototype === Object.prototype || prototype === null
    return structured && isJson(value) ? encodeJson(value) : String(value)
  }
  return encodeJson(part.result.value)
}

export const errorText = (error: unknown) => {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (typeof error === "number" || typeof error === "boolean" || typeof error === "bigint") return String(error)
  if (error === null) return "null"
  if (error === undefined) return "undefined"
  return "Unknown stream error"
}


export const invalidRequest = (message: string, cause?: unknown) =>
  new AIError({
    reason: new InvalidRequestError({ message, cause }),
  })


export const unsupportedOperation = (input: {
  readonly operation: string
  readonly message: string
  readonly provider?: ProviderID
  readonly route?: string
  readonly cause?: unknown
}) =>
  new AIError({
    reason: new UnsupportedOperationError({
      operation: input.operation,
      message: input.message,
      provider: input.provider,
      route: input.route,
      cause: input.cause,
    }),
  })


export const flattenTools = (tools: ReadonlyArray<ToolEntry>, path: ReadonlyArray<string> = []) => {
  const flat = tools.flatMap((tool): ReadonlyArray<ToolDefinition> => {
    if (tool.type === "namespace") return flattenTools(tool.tools, [...path, tool.name])
    if (path.length === 0) return [tool]
    return [new ToolDefinition({ ...tool, name: [...path, tool.name].join("_") })]
  })
  return [...new Map(flat.map((tool) => [tool.name, tool])).values()]
}

export const flattenToolRequest = (request: LLMRequest) => {
  const messages = request.messages.map((message) => {
    const content = message.content.map((part) => {
      if ((part.type !== "tool-call" && part.type !== "tool-result") || part.namespace === undefined) return part
      return { ...part, name: `${part.namespace}_${part.name}`, namespace: undefined }
    })
    return content.every((part, index) => part === message.content[index])
      ? message
      : new Message({ ...message, content })
  })
  return {
    tools: flattenTools(request.tools),
    request: messages.every((message, index) => message === request.messages[index])
      ? request
      : LLMRequest.update(request, { messages }),
  }
}

export const matchToolChoice = <Auto, None, Required, Tool>(
  route: string,
  toolChoice: NonNullable<LLMRequest["toolChoice"]>,
  cases: {
    readonly auto: () => Auto
    readonly none: () => None
    readonly required: () => Required
    readonly tool: (name: string) => Tool
  },
) =>
  Effect.gen(function* () {
    if (toolChoice.type === "auto") return cases.auto()
    if (toolChoice.type === "none") return cases.none()
    if (toolChoice.type === "required") return cases.required()
    if (!toolChoice.name) return yield* invalidRequest(`${route} tool choice requires a tool name`)
    return cases.tool(toolChoice.name)
  })

type ContentType = ContentPart["type"]

const formatContentTypes = (types: ReadonlyArray<ContentType>) => {
  if (types.length <= 1) return types[0] ?? ""
  if (types.length === 2) return `${types[0]} and ${types[1]}`
  return `${types.slice(0, -1).join(", ")}, and ${types.at(-1)}`
}

export const supportsContent = <const Type extends ContentType>(
  part: ContentPart,
  types: ReadonlyArray<Type>,
): part is Extract<ContentPart, { readonly type: Type }> => (types as ReadonlyArray<ContentType>).includes(part.type)

export const unsupportedContent = (
  route: string,
  role: LLMRequest["messages"][number]["role"],
  types: ReadonlyArray<ContentType>,
) => invalidRequest(`${route} ${role} messages only support ${formatContentTypes(types)} content for now`)


export const validateWith =
  <A, I, E extends { readonly message: string }>(decode: (input: I) => Effect.Effect<A, E>) =>
  (payload: I) =>
    decode(payload).pipe(Effect.mapError((error) => invalidRequest(error.message, error)))


export const jsonPost = (input: { readonly url: string; readonly body: string; readonly headers?: Headers.Input }) =>
  HttpClientRequest.post(input.url).pipe(
    HttpClientRequest.setHeaders(Headers.set(Headers.fromInput(input.headers), "content-type", "application/json")),
    HttpClientRequest.bodyText(input.body, "application/json"),
  )

export * as ProviderShared from "./shared.js"

export * as SessionCompaction from "./compaction.js"

import {
  AIError,
  type ContentPart,
  InvalidProviderOutputError,
  InvalidRequestError,
  isContextOverflowFailure,
  LLMClient,
  LLMEvent,
  LLMRequest,
  Message,
  type ToolEntry,
  UnknownProviderError,
  type Usage,
} from "@chassis/ai"
import type { StreamOptions } from "@chassis/ai/route"
import type { SessionCompactionResult } from "@chassis/plugin/effect/session"
import type { SessionError } from "@chassis/schema/session-error"
import { makeLocationNode } from "@chassis/util/effect/app-node"
import { Context, Effect, Layer, Result, Stream } from "effect"
import { Agent } from "../agent.js"
import { Bus } from "../bus.js"
import { Database } from "../database/database.js"
import { llmClient } from "../effect/app-node-platform.js"
import { Model } from "../model.js"
import { State } from "../state.js"
import { Token } from "../util/token.js"
import type { SessionContext } from "./context.js"
import { SessionEvent } from "./event.js"
import { SessionHistory } from "./history.js"
import type { SessionMessage } from "./message.js"
import { SessionModelRequest } from "./model-request.js"
import { SessionProviderContext } from "./provider-context.js"
import { SessionRunnerModel } from "./runner/model.js"
import { SessionRunnerRetry } from "./runner/retry.js"
import { toLLMMessages } from "./runner/to-llm-message.js"
import { contentFilterError, toSessionError } from "./to-session-error.js"
import { SessionUsage } from "./usage.js"

export type Settings = {
  auto: boolean
  
  buffer?: number
  
  keep: number
}

export type Editor = {
  configure: (settings: Partial<Settings>) => void
}

export type Trigger =
  
  | { readonly reason: "auto" | "overflow"; readonly context: SessionContext.Loaded }
  
  | { readonly reason: "manual"; readonly context: SessionContext.Loaded; readonly inputID: SessionMessage.ID }

export type Outcome =
  
  | { readonly status: "skipped" }
  | { readonly status: "completed" }
  | { readonly status: "failed"; readonly error: SessionError.Error }

export interface Interface extends State.Transformable<Editor> {
  readonly compact: (trigger: Trigger) => Effect.Effect<Outcome>
}

export class Service extends Context.Service<Service, Interface>()("@chassis/SessionCompaction") {}


type Result = {
  readonly text: string
  
  readonly recent: string
  
  readonly providerState?: SessionMessage.ProviderState
  readonly providerContext?: SessionProviderContext.Info
  readonly metadata?: Record<string, unknown>
}

type Failure = {
  readonly error: SessionError.Error
}

type Prepared = Effect.Success<ReturnType<SessionModelRequest.Interface["compaction"]>>

type Streamed = {
  readonly text: string
  readonly providerState?: SessionMessage.ProviderState
}

const NOTHING_TO_COMPACT: Failure = { error: { type: "compaction.unavailable", message: "Nothing to compact yet" } }

const SHRINK_STEPS = [0.7, 0.5, 0.35]

const RESERVE_MIN = 16_000

const UNKNOWN_WINDOW = 200_000
const TOOL_OUTPUT_MAX_CHARS = 1_250
const IMAGE_TOKEN_ESTIMATE = 1_500
const PDF_TOKEN_ESTIMATE = 2_000

const SUMMARY_TEMPLATE = `You MUST use this format for your response (you may omit sections that aren't applicable). Do not include the <template> tags in your response.
<template>
## Objective
- [one or two brief sentences describing what the user is trying to accomplish]

## Requirements
- [constraints, preferences, requirements, and scope boundaries stated by the user, or "(none)"]

## Decisions
- [decisions already made and why, or "(none)"]

## Work State
Break the objective into smaller goals and report which are completed, which are being worked on, and which are blocked.
### Completed
- [goals that have been completed; otherwise "(none)"]

### Active
- [goals currently being worked on; otherwise "(none)"]

### Blocked
- [anything blocking progress, and why; otherwise "(none)"]

## Next Move
1. [ordered list of next actions, or "(none)"]

## Relevant Files
List the files and directories, other than the current working directory, that another agent would need to open to continue this work. Include at most 15, most important first. Do not list every file that was read or changed. Include paths outside the current working directory when relevant. If none, write "(none)".
- \`[file or directory path]\`: [brief reason it matters]

## Important Context
- [facts the next agent cannot continue without and cannot easily find on its own; or "(none)"]
</template>`

const SUMMARY_RULES = `Rules:
- Keep each section concise. Use terse, single-line bullets, not prose paragraphs or nested lists.
- Prefer short references over detailed restatement. It is fine to leave out information the next agent can recover from the code or the files listed above.
- Preserve exact file paths, symbols, commands, error strings, URLs, and identifiers.
- Carry forward only user questions or requests that remain unanswered or require further action. Do not repeat ones that newer history has answered or resolved. Preserve exact wording when carrying one forward.
- Preserve consequential workflow state, including whether changes are uncommitted, committed, pushed, under review, or merged.
- Do not mention the summary process or that context was compacted.`

export const buildPrompt = (update: boolean, legacy = false) => {
  const shared = [
    "Summarize only what the user and the assistant said and did. Leave out instructions and setup the assistant was given rather than told by the user: repository conventions, instruction files such as AGENTS.md, and environment details like the session ID. The next agent receives current versions of all of these separately.",
    SUMMARY_TEMPLATE,
    SUMMARY_RULES,
    "Do not continue the task or call tools.",
    "Return only the structured summary in the requested format. Do not include a preamble, explanation, or other commentary.",
  ]
  if (!update) {
    return [
      "You MUST summarize the conversation above into a structured summary that will be given to another agent to resume the work.",
      ...shared,
    ].join("\n\n")
  }
  return [
    "Update the existing checkpoint in the conversation above into one consolidated summary.",
    
    
    
    
    
    ...(legacy
      ? [
          "The existing checkpoint was written with an earlier format that recorded far more detail than this one asks for. Rewrite it at the level of detail described below rather than carrying its detail forward. Keep its requirements, decisions, and open questions; they came from earlier conversation with the user.",
        ]
      : []),
    "Newer history always takes precedence over the existing checkpoint. Preserve previous information unless newer history clearly contradicts, supersedes, resolves, or makes it stale. If something is no longer relevant to continuing the work, you may remove it.",
    "Incorporate newer requirements, decisions, progress, and context. Reconcile Work State and Next Move: move completed work out of Active, remove resolved blockers and answered questions, and preserve unresolved or pending work.",
    "Return only the updated Markdown sections. Do not reproduce the `<conversation-checkpoint>`, `<summary>`, or `<recent-context>` wrapper tags from the previous checkpoint.",
    ...shared,
  ].join("\n\n")
}

const NUDGE =
  "The previous response did not fill in the required summary template. Do not call tools. Return the summary as text using the exact section headings from the template."


const LEGACY_HEADING = "## Additional Context"

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const bus = yield* Bus.Service
    const llm = yield* LLMClient.Service
    const catalog = yield* Model.Service
    const models = yield* SessionRunnerModel.Service
    const db = (yield* Database.Service).db
    const requests = yield* SessionModelRequest.Service

    const state = State.create<Settings, Editor>({
      name: "session-compaction",
      initial: () => ({ auto: true, keep: 15_000 }),
      editor: (settings) => ({
        configure: (update) => {
          Object.assign(settings, update)
        },
      }),
    })

    const compact = Effect.fn("SessionCompaction.compact")(function* (trigger: Trigger): Effect.fn.Return<Outcome> {
      const settings = state.get()
      const context = trigger.context

      
      if (trigger.reason !== "manual" && !settings.auto) return { status: "skipped" }
      if (trigger.reason === "auto" && !due(context, calculateCeiling(context.model.limit, settings.buffer)))
        return { status: "skipped" }
      const native = context.model.compaction?.type === "native"
      const agent = native ? undefined : yield* agents.get(Agent.ID.make("compaction"))
      const model =
        (agent?.model &&
          (yield* models
            .resolve({ ...context.session, model: agent.model }, catalog.available)
            .pipe(Effect.orElseSucceed(() => undefined)))) ??
        context.model
      const ceiling = calculateCeiling(model.limit, settings.buffer)
      
      const cap = Number.isFinite(ceiling)
        ? ceiling
        : calculateCeiling({ ...model.limit, context: UNKNOWN_WINDOW }, settings.buffer)
      
      const budget =
        trigger.reason === "overflow" ? Math.min(cap, Math.floor(estimateContext(context) * SHRINK_STEPS[0])) : cap

      const selected = model === context.model ? trigger : { ...trigger, context: { ...context, model } }
      const compaction = native
        ? compactNatively(selected, budget, settings.keep)
        : summarize(selected, budget, settings.keep)
      return yield* compaction.pipe(
        Effect.matchEffect({
          onSuccess: (result) => publish(selected, result),
          onFailure: (failure) => publish(selected, failure),
        }),
      )
    })

    const due = (context: SessionContext.Loaded, ceiling: number) => {
      const messages = context.messages
      
      const last = messages.at(-1)
      if (last?.type === "compaction" && last.status === "completed") return false
      
      const measured = messages.findLastIndex((message) => hasMeasuredPrompt(message, context.model.ref))
      if (measured < messages.findLastIndex(SessionProviderContext.isCheckpoint)) return false
      return estimateContext(context) >= ceiling
    }

    
    const summarize = Effect.fnUntraced(function* (
      trigger: Trigger,
      budget: number,
      keep: number,
    ): Effect.fn.Return<Result, Failure> {
      const context = trigger.context
      const split = splitConversation(context.messages, keep)
      if (!split) return yield* Effect.fail(NOTHING_TO_COMPACT)

      const previous = previousCompaction(context.messages)
      const prompt = buildPrompt(previous !== undefined, previous?.summary.includes(LEGACY_HEADING) ?? false)
      const headings = SUMMARY_TEMPLATE.split("\n").filter((line) => line.startsWith("##"))
      const filled = (text: string) => text.split("\n").some((line) => headings.includes(line.trim()))
      const prepared = yield* prepare(context, split.older, budget)

      
      
      const send = (request: LLMRequest) =>
        Effect.gen(function* () {
          const prompted = LLMRequest.update(request, { messages: [...request.messages, Message.user(prompt)] })
          const reply = yield* stream(context, prompted, prepared.options)
          if (filled(reply.text)) return { ...reply, recent: split.recent }

          const nudged = LLMRequest.update(prompted, { messages: [...prompted.messages, Message.user(NUDGE)] })
          const retry = yield* stream(context, nudged, prepared.options)
          if (filled(retry.text)) return { ...retry, recent: split.recent }
          return yield* Effect.fail<Failure>({
            error: {
              type: "compaction.failed",
              message: retry.text.trim()
                ? "Compaction summary did not match the required template"
                : "Compaction produced no summary",
            },
          })
        })

      const overhead = Token.estimate(prompt) + Token.estimate(NUDGE)
      return yield* deliver(trigger, prepared, split.recent, budget - overhead, send)
    })

    
    const compactNatively = Effect.fnUntraced(function* (
      trigger: Trigger,
      budget: number,
      keep: number,
    ): Effect.fn.Return<Result, Failure> {
      const context = trigger.context
      if (!context.messages.some(messageToText)) return yield* Effect.fail(NOTHING_TO_COMPACT)
      const unsupported = (message: string) =>
        Effect.fail<Failure>({ error: { type: "provider.unsupported-operation", message } })
      const prepared = yield* prepare(context, context.messages, budget, "session")

      
      const provenance = SessionProviderContext.provenance(context.model)
      if (!provenance) return yield* unsupported("Provider compaction requires a stable, configured endpoint")
      const routed = SessionProviderContext.provenance({ model: prepared.request.model, ref: context.model.ref })
      if (!SessionProviderContext.compatible(provenance, routed)) {
        return yield* unsupported(
          "Provider compaction requires the endpoint in provider/model settings, not a model.request rewrite",
        )
      }

      const toResult = (window: ReadonlyArray<Message>, usage: Usage | undefined) =>
        spend(context.session.id, usage && SessionUsage.record(usage, context.model.cost)).pipe(
          Effect.as<Result>({
            text: "",
            recent: "",
            providerContext: SessionProviderContext.encode(provenance, window),
          }),
        )

      const send = (request: LLMRequest) => {
        if (LLMClient.canCompact(request, { mechanism: "trigger" })) {
          return Effect.gen(function* () {
            const history = yield* SessionHistory.load(db, context.session.id, "local").pipe(Effect.orDie)
            const retained = recentUserMessages(history, context.model, keep)
            const response = yield* llm.compact(request, { ...prepared.options, mechanism: "trigger" })
            return yield* toResult([...retained, Message.assistant(response.checkpoint)], response.usage)
          })
        }
        if (LLMClient.canCompact(request)) {
          return llm
            .compact(request, { mechanism: "endpoint", http: prepared.options.http })
            .pipe(Effect.flatMap((response) => toResult(response.replacement, response.usage)))
        }
        return unsupported(`Native compaction is not supported for ${request.model.provider}/${request.model.route.id}`)
      }

      return yield* deliver(trigger, prepared, "", budget, send)
    })

    
    const deliver = Effect.fnUntraced(function* (
      trigger: Trigger,
      prepared: Prepared,
      recent: string,
      target: number,
      send: (request: LLMRequest) => Effect.Effect<Result, AIError | Failure>,
    ): Effect.fn.Return<Result, Failure> {
      const context = trigger.context
      
      if (trigger.reason !== "manual") {
        yield* bus.publish(SessionEvent.Compaction.Started, { sessionID: context.session.id, reason: "auto", recent })
      }
      if (prepared.event.result) return yield* fromHook(context, prepared.event.result, recent)

      const policy = yield* SessionRunnerRetry.policy(context.session.id)
      let rejections = 0
      let rejected: number | undefined
      let asText = false

      while (true) {
        const fits = !asText && estimateRequest(prepared.request) <= target
        const request = fits
          ? prepared.request
          : (flattenAndDropOldest(prepared.request, context, target) ??
            (rejections > 0
              ? undefined
              : asText
                ? flattenAndDropOldest(prepared.request, context, Number.POSITIVE_INFINITY)
                : prepared.request))
        if (!request) {
          return yield* Effect.fail<Failure>({
            error: {
              type: "compaction.failed",
              message:
                "The compaction request cannot be reduced further without losing the latest exchange or checkpoint",
            },
          })
        }

        const attempt = yield* Effect.result(send(request))
        if (Result.isSuccess(attempt)) return attempt.success
        const cause = attempt.failure
        if (!(cause instanceof AIError)) return yield* Effect.fail(cause)
        const error = toSessionError(cause)
        const tooLarge = cause.reason._tag === "InvalidRequest" && cause.reason.classification === "payload-too-large"

        if (tooLarge && request === prepared.request) {
          asText = true
          continue
        }

        if (tooLarge || isContextOverflowFailure(cause)) {
          const step = SHRINK_STEPS[rejections]
          if (step === undefined) return yield* Effect.fail<Failure>({ error })
          rejected ??= estimateRequest(request)
          target = Math.floor(rejected * step)
          rejections++
          continue
        }

        const decision = yield* policy({
          cause,
          error,
          agent: context.agent.id,
          model: context.model.ref,
          hook: prepared.retry,
          retry: SessionRunnerRetry.isRetryable(cause),
        })
        if (!decision.retry) return yield* Effect.fail<Failure>({ error })
        yield* Effect.sleep(decision.delay)
      }
    })

    
    const flattenAndDropOldest = (request: LLMRequest, context: SessionContext.Loaded, target: number) => {
      const previous = previousCompaction(context.messages)
      const end =
        request.messages.findLastIndex(
          (message) =>
            (previous !== undefined && message.id === previous.id) ||
            message.content.some((part) => part.type === "compaction"),
        ) + 1
      const summary = previous !== undefined && !SessionProviderContext.isCheckpoint(previous) ? previous : undefined
      
      
      const lead = summary
        ? toLLMMessages([{ ...summary, recent: "" }], context.model.ref)
        : request.messages.slice(0, end)

      
      const exchanges = request.messages.slice(end).reduce<string[]>(
        (groups, message) => {
          const text = flattenMessage(message)
          if (!text) return groups
          if (message.role === "user" || groups.length === 0) groups.push(text)
          else groups[groups.length - 1] += `\n${text}`
          return groups
        },
        summary?.recent ? [summary.recent] : [],
      )

      const note = (omitted: number) =>
        omitted ? `[${omitted} older ${omitted === 1 ? "exchange" : "exchanges"} omitted]\n\n` : ""
      
      const room =
        target -
        estimateRequest({ system: request.system, tools: request.tools, messages: lead }) -
        Token.estimate(note(exchanges.length))
      const kept = exchanges.slice(oldestToDrop(exchanges, (text) => Token.estimate(text) + 1, room))
      if (kept.length === 0) return undefined
      return LLMRequest.update(request, {
        messages: [...lead, Message.user(note(exchanges.length - kept.length) + kept.join("\n\n"))],
      })
    }

    const stream = (context: SessionContext.Loaded, request: LLMRequest, options: StreamOptions) => {
      const sessionID = context.session.id
      const metadataKey = context.model.model.route.providerMetadataKey ?? context.model.model.provider
      const unusable = (error: SessionError.Error) => Effect.fail<Failure>({ error })

      return llm.stream(request, options).pipe(
        Stream.runFoldEffect(
          (): Streamed => ({ text: "" }),
          (streamed, event): Effect.Effect<Streamed, AIError | Failure> => {
            if (LLMEvent.is.providerError(event)) {
              if (event.classification === undefined)
                return unusable({ type: "provider.error", message: event.message })
              return Effect.fail(
                new AIError({
                  reason: new InvalidRequestError({ message: event.message, classification: event.classification }),
                }),
              )
            }

            if (LLMEvent.is.textDelta(event)) {
              return bus
                .publish(SessionEvent.Compaction.Delta, { sessionID, text: event.text })
                .pipe(Effect.as({ ...streamed, text: streamed.text + event.text }))
            }

            if (LLMEvent.is.stepFinish(event)) {
              return spend(sessionID, SessionUsage.record(event.usage, context.model.cost)).pipe(
                Effect.as({ ...streamed, providerState: event.providerMetadata?.[metadataKey] }),
              )
            }

            if (!LLMEvent.is.finish(event)) return Effect.succeed(streamed)
            switch (event.reason.normalized) {
              case "unknown":
                return Effect.fail(
                  new AIError({
                    reason: new InvalidProviderOutputError({
                      message: "The provider response ended with an unknown finish reason.",
                      classification: "incomplete-stream",
                    }),
                  }),
                )
              case "error":
                return Effect.fail(
                  new AIError({ reason: new UnknownProviderError({ message: "Compaction generation failed" }) }),
                )
              case "length":
                return unusable({
                  type: "compaction.failed",
                  message: "Compaction summary reached the output token limit",
                })
              case "content-filter":
                return unusable(contentFilterError("Compaction summary was blocked by the provider", event.reason))
              default:
                return Effect.succeed(streamed)
            }
          },
        ),
      )
    }

    
    const prepare = (
      context: SessionContext.Loaded,
      messages: ReadonlyArray<SessionMessage.Info>,
      budget: number,
      webSocket?: "session",
    ) => {
      const base = transcript(context, messages)
      return requests.compaction({
        session: context.session,
        agent: context.agent.id,
        model: context.model,
        tools: context.tools,
        system: base.system,
        messages: base.messages,
        webSocket,
        inputTokens: { measured: budget, estimated: 0 },
      })
    }

    
    const fromHook = (context: SessionContext.Loaded, supplied: SessionCompactionResult, recent: string) => {
      const usage = supplied.tokens && {
        tokens: supplied.tokens,
        cost: SessionUsage.calculateCost(context.model.cost, supplied.tokens),
      }
      return spend(context.session.id, usage).pipe(
        Effect.as<Result>({
          text: supplied.summary,
          recent,
          providerState: supplied.providerState,
          metadata: supplied.metadata,
        }),
      )
    }

    
    const spent = new Map<SessionContext.Loaded["session"]["id"], SessionUsage.Recorded>()
    const spend = (sessionID: SessionContext.Loaded["session"]["id"], usage: SessionUsage.Recorded | undefined) =>
      Effect.gen(function* () {
        if (!usage) return
        const total = spent.get(sessionID)
        spent.set(sessionID, total ? SessionUsage.add(total, usage) : usage)
        yield* bus.publish(SessionEvent.UsageRecorded, { sessionID, source: "compaction", ...usage })
      })

    const publish = Effect.fnUntraced(function* (
      trigger: Trigger,
      outcome: Result | Failure,
    ): Effect.fn.Return<Outcome> {
      const context = trigger.context
      const sessionID = context.session.id
      const reason = trigger.reason === "manual" ? "manual" : "auto"
      const usage = spent.get(sessionID)

      if ("error" in outcome) {
        yield* bus.publish(SessionEvent.Compaction.Failed, {
          sessionID,
          reason,
          inputID: trigger.reason === "manual" ? trigger.inputID : undefined,
          error: outcome.error,
          ...usage,
        })
        return { status: "failed", error: outcome.error }
      }

      yield* bus.publish(
        SessionEvent.Compaction.Ended,
        {
          sessionID,
          reason,
          model: context.model.ref,
          providerState: outcome.providerState,
          providerContext: outcome.providerContext,
          text: outcome.text,
          recent: outcome.recent,
          ...usage,
        },
        { metadata: outcome.metadata },
      )
      return { status: "completed" }
    })

    return Service.of({
      transform: state.transform,
      reload: state.reload,
      
      compact: (trigger) =>
        compact(trigger).pipe(
          Effect.onInterrupt(() =>
            trigger.reason === "manual"
              ? Effect.void
              : publish(trigger, { error: { type: "compaction.interrupted", message: "Compaction was interrupted" } }),
          ),
          Effect.ensuring(Effect.sync(() => spent.delete(trigger.context.session.id))),
        ),
    })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Agent.node, Bus.node, Database.node, llmClient, Model.node, SessionModelRequest.node, SessionRunnerModel.node],
})


const previousCompaction = (messages: ReadonlyArray<SessionMessage.Info>) => {
  const [first] = messages
  return first?.type === "compaction" && first.status === "completed" ? first : undefined
}

const transcript = (context: SessionContext.Loaded, messages: ReadonlyArray<SessionMessage.Info>) =>
  SessionModelRequest.baseTranscript({
    agent: context.agent.info,
    model: context.model,
    tools: context.tools,
    initial: context.initial,
    messages,
  })


const splitConversation = (messages: ReadonlyArray<SessionMessage.Info>, keep: number) => {
  const entries = messages.flatMap((message, index) => {
    const text = messageToText(message)
    return text ? [{ message, text, index }] : []
  })
  if (entries.length === 0) return undefined

  const recent = entries.slice(recentStart(entries, keep, previousCompaction(messages)))
  return {
    older: messages.slice(0, recent[0]?.index ?? messages.length),
    recent: recent.map((entry) => entry.text).join("\n\n"),
  }
}

const recentStart = (
  entries: ReadonlyArray<{ readonly message: SessionMessage.Info; readonly text: string }>,
  keep: number,
  previous: SessionMessage.CompactionCompleted | undefined,
) => {
  
  const dropped = Math.min(
    oldestToDrop(entries, (entry) => Token.estimate(entry.text), keep),
    entries.length - 1,
  )

  
  const userBoundary = entries.findLastIndex((entry, index) => index <= dropped && entry.message.type === "user")
  if (userBoundary > 0) return userBoundary

  
  const latestUser = entries.findLastIndex((entry) => entry.message.type === "user")
  if (latestUser > 0) return latestUser

  
  
  return previous?.recent ? 0 : entries.length
}

const oldestToDrop = <T>(items: ReadonlyArray<T>, size: (item: T) => number, budget: number) => {
  let total = 0
  let start = items.length
  while (start > 0) {
    const next = total + size(items[start - 1])
    if (next > budget) break
    total = next
    start--
  }
  return start
}


const messageToText = (message: SessionMessage.Info): string => {
  switch (message.type) {
    
    case "compaction":
    case "system":
      return ""

    case "user": {
      const skills =
        message.skills?.flatMap((skill) =>
          skill.text === undefined ? [] : [`[Skill activated: ${skill.name}]\n${skill.text}`],
        ) ?? []
      const files =
        message.files?.map((file) => {
          const name = file.name ?? (file.source.type === "uri" ? file.source.uri : "inline attachment")
          return `[Attached ${file.mime}: ${name}]`
        }) ?? []
      return [...skills, `[User]: ${message.text}`, ...files].join("\n")
    }

    case "location-switched":
      return `[User]: The working directory has been changed to ${message.location.directory}.`

    case "assistant":
      return message.content
        .flatMap((part) => {
          if (part.type === "text") return [`[Assistant]: ${part.text}`]
          if (part.type === "reasoning") return part.text ? [`[Assistant reasoning]: ${part.text}`] : []

          const input = typeof part.state.input === "string" ? part.state.input : JSON.stringify(part.state.input)
          const call = `[Assistant tool call]: ${part.name}(${input})`
          if (part.state.status === "completed") {
            return [call, `[Tool result]: ${truncateToolOutput(serializeToolContent(part.state.content))}`]
          }
          if (part.state.status === "error") return [call, `[Tool error]: ${part.state.error.message}`]
          return [call]
        })
        .join("\n")

    case "synthetic":
      return `[Synthetic context]: ${message.text}`

    case "skill":
      return `[Skill activated: ${message.name}]\n${message.text}`

    case "shell":
      if (message.metadata?.background === true) return ""
      return `[Shell]: ${message.command}\n${truncateToolOutput(message.output?.output ?? "")}`

    default:
      return ""
  }
}

const truncateToolOutput = (value: string) => {
  if (value.length <= TOOL_OUTPUT_MAX_CHARS) return value

  
  let end = 0
  let kept = 0
  for (const char of value) {
    if (kept === TOOL_OUTPUT_MAX_CHARS) break
    end += char.length
    kept++
  }
  if (end === value.length) return value
  return `${value.slice(0, end)}\n[truncated]`
}


const flattenMessage = (message: Message) => {
  if (message.role === "system") return ""
  return message.content
    .flatMap((part) => {
      if (part.type === "text")
        return part.text ? [`[${message.role === "user" ? "User" : "Assistant"}]: ${part.text}`] : []
      if (part.type === "media") return [`[${part.media.mediaType} omitted]`]
      if (part.type === "tool-call") return [`[Assistant tool call]: ${part.name}(${JSON.stringify(part.input) ?? ""})`]
      if (part.type !== "tool-result") return []
      const result = part.result
      const output =
        result.type === "content"
          ? serializeToolContent(result.value)
          : typeof result.value === "string"
            ? result.value
            : (JSON.stringify(result.value) ?? "")
      const label = result.type === "error" ? "Tool error" : "Tool result"
      return [`[${label}]: ${truncateToolOutput(output)}`]
    })
    .join("\n")
}

const serializeToolContent = (content: ReadonlyArray<SessionMessage.ToolStateCompleted["content"][number]>) =>
  content
    .map((item) => {
      if (item.type === "text") return item.text
      return `[Attached ${item.mime}${item.name === undefined ? "" : `: ${item.name}`}]`
    })
    .join("\n")


export const recentUserMessages = (
  messages: ReadonlyArray<SessionMessage.Info>,
  model: Pick<SessionContext.Loaded["model"], "ref" | "capabilities">,
  keep: number,
) => {
  const users = messages
    .filter((message) => message.type === "user")
    .map((message) => ({ ...message, skills: undefined }))
  const sendable = SessionModelRequest.boundImages(
    SessionModelRequest.unsupportedParts(toLLMMessages(users, model.ref), model.capabilities),
  )
  return sendable.slice(oldestToDrop(sendable, estimateMessage, keep))
}

export const estimateContext = (context: SessionContext.Loaded) => {
  const prompt = estimatePrompt(context)
  return prompt.measured + prompt.estimated
}


export const estimatePrompt = (context: SessionContext.Loaded) => {
  const anchorIndex = context.messages.findLastIndex((message) => hasMeasuredPrompt(message, context.model.ref))
  const anchor = context.messages[anchorIndex]
  const base = transcript(context, context.messages.slice(Math.max(0, anchorIndex)))
  
  
  
  const sent = SessionModelRequest.boundImages(
    SessionModelRequest.unsupportedParts(base.messages, context.model.capabilities),
  )
  
  const unmeasured = sent.filter((message) => message.role !== "assistant" || message.id !== anchor?.id)

  if (anchor?.type !== "assistant" || !anchor.tokens)
    return {
      measured: 0,
      estimated: estimateRequest({ system: base.system, tools: context.tools.definitions, messages: unmeasured }),
    }

  const tokens = anchor.tokens
  return {
    measured: tokens.input + tokens.cache.read + tokens.cache.write + tokens.output + tokens.reasoning,
    estimated: unmeasured.reduce((sum, message) => sum + estimateMessage(message), 0),
  }
}


const calculateCeiling = (limit: SessionContext.Loaded["model"]["limit"], buffer: number | undefined) => {
  
  
  const window = limit.input || limit.context
  if (window <= 0) return Number.POSITIVE_INFINITY
  if (buffer !== undefined) return window - buffer
  return window - Math.max(Math.floor(window * 0.1), window >= 2 * RESERVE_MIN ? RESERVE_MIN : 0)
}


const hasMeasuredPrompt = (message: SessionMessage.Info, model: SessionContext.Loaded["model"]["ref"]) =>
  message.type === "assistant" &&
  message.model.providerID === model.providerID &&
  !message.error &&
  message.tokens !== undefined &&
  message.tokens.input + message.tokens.cache.read + message.tokens.cache.write > 0

const estimateRequest = (request: Pick<LLMRequest, "system" | "tools" | "messages">) =>
  request.system.reduce((sum, part) => sum + Token.estimate(part.text), 0) +
  request.tools.reduce((sum, tool) => sum + estimateTool(tool), 0) +
  request.messages.reduce((sum, message) => sum + estimateMessage(message), 0)


const estimateTool = (tool: ToolEntry): number => {
  if (tool.type === "tool") return Token.estimate(tool.name + tool.description + JSON.stringify(tool.inputSchema))
  return (
    Token.estimate(tool.name + (tool.description ?? "")) +
    tool.tools.reduce((sum, entry) => sum + estimateTool(entry), 0)
  )
}

const estimateMessage = (message: Message) => message.content.reduce((sum, part) => sum + estimatePart(part), 0)

const estimatePart = (part: ContentPart): number => {
  
  if (part.type === "compaction") return Token.estimate(part.text ?? "")
  if (part.type === "effort") return 0
  if (part.type === "text" || part.type === "reasoning") return Token.estimate(part.text)
  if (part.type === "media") return estimateMedia(part.media.mediaType)
  if (part.type === "tool-call") return Token.estimate(part.name + (JSON.stringify(part.input) ?? ""))

  if (part.result.type === "content")
    return part.result.value.reduce(
      (sum, content) => sum + (content.type === "text" ? Token.estimate(content.text) : estimateMedia(content.mime)),
      0,
    )
  const value = part.result.value
  return Token.estimate(typeof value === "string" ? value : (JSON.stringify(value) ?? ""))
}

const estimateMedia = (mime: string) => {
  const type = mime.toLowerCase()
  if (type.startsWith("image/")) return IMAGE_TOKEN_ESTIMATE
  if (type === "application/pdf") return PDF_TOKEN_ESTIMATE
  return 0
}

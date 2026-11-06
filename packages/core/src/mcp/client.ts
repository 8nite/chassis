export * as McpClient from "./client.js"

import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  Client,
  SdkError,
  SdkErrorCode,
  SdkHttpError,
  StreamableHTTPClientTransport,
  UnauthorizedError,
  UnsupportedProtocolVersionError,
  type CallToolResult as SdkCallToolResult,
  type ElicitRequestFormParams,
  type ElicitRequestParams,
  type ElicitRequestURLParams,
  type ElicitResult,
  type GetPromptResult,
  type Implementation,
  type OAuthClientProvider,
  type Prompt,
  type ReadResourceResult,
  type Resource,
  type ResourceTemplateType,
  type Tool,
  type Transport,
  type VersionNegotiationOptions,
} from "@modelcontextprotocol/client"
import { Cause, Clock, Duration, Effect, Exit, Schedule, Schema } from "effect"
import { ConfigMCP } from "@chassis/schema/config/mcp"
import type { Session } from "@chassis/schema/session"
import { McpStdio } from "./stdio.js"

const DEFAULT_STARTUP_TIMEOUT = 30_000
const DEFAULT_CATALOG_TIMEOUT = 30_000
const DEFAULT_EXECUTION_TIMEOUT = 12 * 60 * 60 * 1_000 
const TERMINATE_TIMEOUT = 1_000
const toError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)))


const describe = (error: unknown) => {
  if (!(error instanceof Error)) return String(error)
  const detail =
    error instanceof SdkHttpError
      ? `HTTP ${error.status}`
      : !(error instanceof SdkError) && "code" in error && typeof error.code === "string"
        ? error.code
        : undefined
  return detail && !error.message.includes(detail) ? `${error.message} (${detail})` : error.message
}




const isTransient = (error: unknown) =>
  error instanceof SdkHttpError
    ? error.status === 408 || error.status === 429 || (error.status >= 500 && error.status !== 501)
    : error instanceof TypeError && "code" in error

export type { GetPromptResult, Prompt, ReadResourceResult, Resource, Tool }
export type ResourceTemplate = ResourceTemplateType

export class NeedsAuthError extends Schema.TaggedError<NeedsAuthError>()("MCP.NeedsAuthError", {
  server: Schema.String,
  message: Schema.String,
}) {}

export class ConnectError extends Schema.TaggedError<ConnectError>()("MCP.ConnectError", {
  server: Schema.String,
  message: Schema.String,
}) {}


export class SessionExpiredError extends Schema.TaggedError<SessionExpiredError>()("MCP.SessionExpiredError", {
  server: Schema.String,
}) {
  override get message() {
    return `MCP server session expired: ${this.server}`
  }
}

export type CallToolContent =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "media"; readonly data: string; readonly mimeType: string }

export interface CallToolResult {
  readonly isError: boolean
  readonly structured?: unknown
  readonly content: ReadonlyArray<CallToolContent>
}

export type ElicitationFormParams = ElicitRequestFormParams
export type ElicitationParams = ElicitRequestParams
export type ElicitationResult = ElicitResult

export interface ElicitationHandler {
  readonly create: (input: {
    readonly server: string
    readonly params: ElicitationParams
    readonly signal: AbortSignal
  }) => Effect.Effect<ElicitationResult, Error>
  
  readonly complete: (input: {
    readonly server: string
    readonly elicitationID: ElicitRequestURLParams["elicitationId"]
  }) => Effect.Effect<void>
}


export interface Connection {
  
  readonly modern: boolean
  readonly instructions: string | undefined
  readonly tools: () => Effect.Effect<Tool[], Error>
  readonly prompts: () => Effect.Effect<Prompt[], Error>
  readonly resources: () => Effect.Effect<Resource[], Error>
  readonly resourceTemplates: () => Effect.Effect<ResourceTemplateType[], Error>
  
  readonly readResource: (input: { readonly uri: string }) => Effect.Effect<ReadResourceResult | undefined, Error>
  readonly prompt: (input: {
    readonly name: string
    readonly args?: Record<string, string>
  }) => Effect.Effect<GetPromptResult, Error>
  readonly callTool: (input: {
    readonly name: string
    readonly args?: Record<string, unknown>
    readonly sessionID?: Session.ID
  }) => Effect.Effect<CallToolResult, Error>
  readonly onClose: (callback: (reason: string) => void) => void
  readonly onSessionExpired: (callback: () => void) => void
  readonly onToolsChanged: (callback: () => void) => void
  readonly onPromptsChanged: (callback: () => void) => void
  readonly onResourcesChanged: (callback: () => void) => void
}


export const connect = Effect.fnUntraced(function* (
  server: string,
  config: typeof ConfigMCP.Server.Type,
  directory: string,
  
  authProvider?: OAuthClientProvider,
  elicitation?: ElicitationHandler,
  clientInfo: Implementation = { name: "chassis", version: "unknown" },
) {
  
  
  const changed = { tools: () => {}, prompts: () => {}, resources: () => {} }
  const listChanged = (key: keyof typeof changed) => ({
    autoRefresh: false,
    debounceMs: 0,
    onChanged: () => changed[key](),
  })

  
  let lastError: string | undefined
  const explain = (error: unknown) =>
    error instanceof SdkError && error.code === SdkErrorCode.ConnectionClosed && lastError
      ? `${describe(error)}: ${lastError}`
      : describe(error)

  
  const retrying = <A, E>(what: string, effect: Effect.Effect<A, E>, deadline = Infinity) =>
    Effect.retry(
      effect,
      Schedule.max([Schedule.exponential("250 millis", 4), Schedule.recurs(2)]).pipe(
        Schedule.setInputType<E>(),
        Schedule.while(({ input, now, duration }) =>
          !isTransient(input) || now + Duration.toMillis(duration) >= deadline
            ? Effect.succeed(false)
            : Effect.logWarning(`retrying ${what}`, { server, error: describe(input) }).pipe(Effect.as(true)),
        ),
      ),
    )

  const initialize = Effect.fnUntraced(function* (transport: Transport) {
    const runFork = Effect.runForkWith(yield* Effect.context())
    const client = new Client(clientInfo, {
      capabilities: {
        ...(elicitation ? { elicitation: { form: { applyDefaults: true }, url: {} } } : {}),
        
        
        roots: {},
      },
      versionNegotiation: negotiation(config.protocol),
      listChanged: {
        tools: listChanged("tools"),
        prompts: listChanged("prompts"),
        resources: listChanged("resources"),
      },
    })
    
    client.onerror = (error) => {
      if (error.name === "AbortError") return
      lastError = describe(error)
      runFork(Effect.logWarning("mcp transport error", { server, error: lastError }))
    }
    client.setRequestHandler("roots/list", () => ({ roots: [{ uri: pathToFileURL(directory).href }] }))
    if (elicitation) {
      client.setRequestHandler("elicitation/create", (request, ctx) =>
        Effect.runPromise(elicitation.create({ server, params: request.params, signal: ctx.mcpReq.signal })),
      )
      client.setNotificationHandler("notifications/elicitation/complete", (notification) =>
        Effect.runPromise(elicitation.complete({ server, elicitationID: notification.params.elicitationId })),
      )
    }

    yield* Effect.tryPromise({
      try: (signal) =>
        client.connect(transport, { timeout: config.timeout?.startup ?? DEFAULT_STARTUP_TIMEOUT, signal }),
      catch: (error) => error,
    }).pipe(Effect.onError(() => Effect.promise(() => transport.close()).pipe(Effect.ignore)))
    return client
  })

  
  
  
  
  const session: { transport?: StreamableHTTPClientTransport; expired?: () => void; reported: boolean } = {
    reported: false,
  }
  const failure = (error: unknown) => {
    if (!(error instanceof SdkHttpError) || session.transport?.sessionId === undefined) return new Error(explain(error))
    const expired =
      error.status === 404 ||
      (error.status === 400 &&
        typeof error.data.text === "string" &&
        error.data.text.includes("Bad Request: Server not initialized"))
    if (!expired) return new Error(explain(error))
    if (!session.reported) {
      session.reported = true
      session.expired?.()
    }
    return new SessionExpiredError({ server })
  }

  const exit = yield* Effect.gen(function* () {
    if (config.type === "local") {
      const [command, ...args] = config.command
      const transport = yield* McpStdio.make({
        server,
        command,
        args,
        cwd: config.cwd ? path.resolve(directory, config.cwd) : directory,
        environment: {
          ...(command === "chassis" ? { BUN_BE_BUN: "1" } : {}),
          ...config.environment,
        },
      })
      return yield* initialize(transport)
    }
    if (!URL.canParse(config.url))
      return yield* new ConnectError({ server, message: `Invalid MCP URL for "${server}"` })
    const { McpOAuth } = yield* Effect.promise(() => import("./oauth.js"))
    const fetch = yield* McpOAuth.loggedFetch({ server, directory })
    
    
    const url = new URL(config.url)
    const addedCodemode = config.codemode !== false && !url.searchParams.has("codemode")
    if (addedCodemode) url.searchParams.set("codemode", "false")
    const open = Effect.fnUntraced(function* (url: URL) {
      session.transport = new StreamableHTTPClientTransport(url, {
        requestInit: config.headers ? { headers: config.headers } : undefined,
        authProvider,
        fetch,
      })
      return yield* initialize(session.transport)
    })

    
    const deadline = (yield* Clock.currentTimeMillis) + (config.timeout?.startup ?? DEFAULT_STARTUP_TIMEOUT)
    return yield* retrying(
      "MCP connect",
      open(url).pipe(
        Effect.catch((error) => {
          if (!addedCodemode || !(error instanceof SdkHttpError) || (error.status !== 400 && error.status !== 404))
            return Effect.fail(error)
          
          return open(new URL(config.url))
        }),
      ),
      deadline,
    )
  }).pipe(Effect.exit)
  if (Exit.isSuccess(exit)) {
    const client = exit.value
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        
        
        const transport = session.transport
        
        client.onerror = undefined
        if (transport?.sessionId !== undefined && !session.reported)
          yield* Effect.tryPromise({ try: () => transport.terminateSession(), catch: toError }).pipe(
            Effect.timeoutOrElse({
              duration: TERMINATE_TIMEOUT,
              orElse: () => Effect.fail(new Error(`Timed out after ${TERMINATE_TIMEOUT}ms`)),
            }),
            Effect.tapError((error) =>
              Effect.logWarning("failed to terminate MCP session", { server, error: error.message }),
            ),
            Effect.ignore,
          )
        yield* Effect.tryPromise(() => client.close()).pipe(Effect.ignore)
      }),
    )
    const catalog = { timeout: config.timeout?.catalog ?? DEFAULT_CATALOG_TIMEOUT }
    const execution = config.timeout?.execution ?? DEFAULT_EXECUTION_TIMEOUT
    const request = <A>(what: string, run: (signal: AbortSignal) => Promise<A>) =>
      Effect.tryPromise({ try: run, catch: failure }).pipe(
        Effect.tapError((error) => Effect.logWarning(`failed to ${what}`, { server, error: error.message })),
      )
    
    const list = <A>(what: string, run: () => Promise<A>) =>
      retrying(what, Effect.tryPromise({ try: run, catch: (error) => error })).pipe(
        Effect.mapError(failure),
        Effect.tapError((error) => Effect.logWarning(`failed to ${what}`, { server, error: error.message })),
      )

    return {
      modern: client.getProtocolEra() === "modern",
      instructions: client.getInstructions()?.trim() || undefined,
      tools: () => list("list MCP tools", () => client.listTools(undefined, catalog)).pipe(Effect.map((r) => r.tools)),
      prompts: () =>
        list("list MCP prompts", () => client.listPrompts(undefined, catalog)).pipe(Effect.map((r) => r.prompts)),
      resources: () =>
        list("list MCP resources", () => client.listResources(undefined, catalog)).pipe(Effect.map((r) => r.resources)),
      resourceTemplates: () =>
        list("list MCP resource templates", () => client.listResourceTemplates(undefined, catalog)).pipe(
          Effect.map((r) => r.resourceTemplates),
        ),
      readResource: (input) => {
        if (!client.getServerCapabilities()?.resources) return Effect.succeed(undefined)
        return request("read MCP resource", (signal) =>
          client.readResource({ uri: input.uri }, { signal, timeout: execution }),
        )
      },
      prompt: (input) =>
        request("get MCP prompt", (signal) =>
          client.getPrompt({ name: input.name, arguments: input.args ?? {} }, { signal, timeout: execution }),
        ),
      callTool: (input) =>
        request("call MCP tool", (signal) =>
          client.callTool(
            {
              name: input.name,
              arguments: input.args ?? {},
              ...(input.sessionID === undefined ? {} : { _meta: { "ai.chassis/sessionID": input.sessionID } }),
            },
            
            { signal, timeout: execution, onprogress: () => {} },
          ),
        ).pipe(Effect.map(toCallToolResult)),
      onClose: (callback) => {
        client.onclose = () => callback(lastError ? `Connection closed: ${lastError}` : "Connection closed")
      },
      onSessionExpired: (callback) => {
        session.expired = callback
      },
      onToolsChanged: (callback) => {
        changed.tools = callback
      },
      onPromptsChanged: (callback) => {
        changed.prompts = callback
      },
      onResourcesChanged: (callback) => {
        changed.resources = callback
      },
    } satisfies Connection
  }

  const error = Cause.squash(exit.cause)
  if (error instanceof UnauthorizedError) return yield* new NeedsAuthError({ server, message: error.message })
  if (error instanceof UnsupportedProtocolVersionError)
    return yield* new ConnectError({
      server,
      message: `${error.message}; the server supports ${error.supported.join(", ")}. Set "protocol" for this server to one of those or to "legacy".`,
    })
  return yield* new ConnectError({ server, message: explain(error) })
})


function negotiation(protocol: ConfigMCP.Protocol | undefined): VersionNegotiationOptions | undefined {
  if (protocol === undefined || protocol === "legacy") return undefined
  if (protocol === "auto") return { mode: "auto" }
  return { mode: { pin: protocol } }
}

function toCallToolResult(result: SdkCallToolResult): CallToolResult {
  return {
    isError: result.isError === true,
    structured: result.structuredContent,
    content: result.content.flatMap((part): CallToolContent[] => {
      if (part.type === "text") return [{ type: "text", text: part.text }]
      if (part.type === "image" || part.type === "audio")
        return [{ type: "media", data: part.data, mimeType: part.mimeType }]
      if (part.type === "resource_link") return [{ type: "text", text: part.uri }]
      if (part.type === "resource") {
        const resource = part.resource
        if ("text" in resource && typeof resource.text === "string") return [{ type: "text", text: resource.text }]
        if ("blob" in resource && typeof resource.blob === "string" && typeof resource.mimeType === "string")
          return [{ type: "media", data: resource.blob, mimeType: resource.mimeType }]
        return [{ type: "text", text: resource.uri }]
      }
      return []
    }),
  }
}

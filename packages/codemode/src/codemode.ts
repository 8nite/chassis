import { Effect, Schema } from "effect"
import type { Extension } from "./extension.js"
import { executeProgram } from "./interpreter/execute.js"
import { extensionGlobals } from "./interpreter/extensions.js"
import { globalNames } from "./interpreter/globals.js"
import { type Services, type ToolDescription, ToolRuntime } from "./tool-runtime.js"
import type { Tools } from "./tools.js"


export type {
  CallResult,
  ExtensionInvocation,
  Hooks,
  ToolCall,
  ToolDescription,
  ToolInvocation,
} from "./tool-runtime.js"

export { searchSignature, toolExpression } from "./tool-runtime.js"


export type ExecutionLimits = {
  
  readonly timeoutMs?: number
  
  readonly maxToolCalls?: number
  
  readonly maxOutputBytes?: number
}

export type ResolvedExecutionLimits = {
  readonly timeoutMs: number | undefined
  readonly maxToolCalls: number | undefined
  readonly maxOutputBytes: number | undefined
}


export type Options<Provided extends Record<string, unknown> = {}> = {
  
  tools?: Provided & Tools<Services<Provided>>
  
  hooks?: ToolRuntime.Hooks<Services<Provided>>
  
  extensions?: ReadonlyArray<Extension>
  
  limits?: ExecutionLimits
}


export type ExecuteOptions<Provided extends Record<string, unknown> = {}> = Options<Provided> & {
  
  code: string
}


export type DataValue = Schema.Json


export const Input = Schema.Struct({ code: Schema.String })
export type Input = typeof Input.Type

export const DiagnosticKind = Schema.Literals([
  "ParseError",
  "UnsupportedSyntax",
  "UnknownTool",
  "InvalidToolInput",
  "InvalidToolOutput",
  "InvalidDataValue",
  "ToolCallLimitExceeded",
  "TimeoutExceeded",
  "ToolFailure",
  "ExecutionFailure",
  "Truncated",
])

export type DiagnosticKind = typeof DiagnosticKind.Type

export const Diagnostic = Schema.Struct({
  kind: DiagnosticKind,
  message: Schema.String,
  location: Schema.optionalKey(Schema.Struct({ line: Schema.Number, column: Schema.Number })),
  suggestions: Schema.optionalKey(Schema.Array(Schema.String)),
})

export type Diagnostic = typeof Diagnostic.Type

const ToolCallSchema = Schema.Struct({ name: Schema.String })
export const Success = Schema.Struct({
  ok: Schema.Literal(true),
  value: Schema.Json,
  warnings: Schema.optionalKey(Schema.Array(Diagnostic)),
  logs: Schema.optionalKey(Schema.Array(Schema.String)),
  truncated: Schema.optionalKey(Schema.Boolean),
  toolCalls: Schema.Array(ToolCallSchema),
})

export type Success = typeof Success.Type

export const Failure = Schema.Struct({
  ok: Schema.Literal(false),
  error: Diagnostic,
  logs: Schema.optionalKey(Schema.Array(Schema.String)),
  truncated: Schema.optionalKey(Schema.Boolean),
  toolCalls: Schema.Array(ToolCallSchema),
})

export type Failure = typeof Failure.Type


export const Result = Schema.Union([Success, Failure])

export type Result = typeof Result.Type


export type Runtime<R = never> = {
  readonly catalog: ReadonlyArray<ToolDescription>
  readonly execute: (code: string) => Effect.Effect<Result, never, R>
}

const validateLimit = (name: keyof ExecutionLimits, value: number | undefined, minimum: number): number | undefined => {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < minimum)) {
    throw new RangeError(`${name} must be a safe integer greater than or equal to ${minimum}.`)
  }
  return value
}

const resolveExecutionLimits = (limits?: ExecutionLimits): ResolvedExecutionLimits => ({
  timeoutMs: validateLimit("timeoutMs", limits?.timeoutMs, 1),
  maxToolCalls: validateLimit("maxToolCalls", limits?.maxToolCalls, 0),
  maxOutputBytes: validateLimit("maxOutputBytes", limits?.maxOutputBytes, 0),
})


export const execute = <const Provided extends Record<string, unknown>>(
  options: ExecuteOptions<Provided>,
): Effect.Effect<Result, never, Services<Provided>> => make(options).execute(options.code)


export const make = <const Provided extends Record<string, unknown> = {}>(
  options: Options<Provided> = {},
): Runtime<Services<Provided>> => {
  const prepared = ToolRuntime.prepare((options.tools ?? {}) as Tools<Services<Provided>>)
  const limits = resolveExecutionLimits(options.limits)
  const extensions = options.extensions ?? []
  const bound = new Set(globalNames)
  for (const extension of extensions) {
    for (const name of Object.keys(extension.globals)) {
      if (bound.has(name)) throw new TypeError(`Extension "${extension.name}" global "${name}" is already defined.`)
      bound.add(name)
    }
  }
  return {
    get catalog() {
      return prepared.catalog
    },
    execute: (code) =>
      executeProgram(code, prepared, limits, options.hooks ?? {}, (ctx) => extensionGlobals(ctx, extensions)),
  }
}

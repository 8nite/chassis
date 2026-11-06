export * as AISDKNative from "./aisdk-native.js"

import { Effect, Option, Schema, Struct } from "effect"
import { Provider } from "./provider.js"

type Overlays = {
  settings?: Provider.Settings
  headers?: Record<string, string>
  body?: Record<string, unknown>
}

type Target<ID extends string> = Overlays & {
  package?: string
  variants?: (Overlays & { id: ID })[]
}

type Context = {
  readonly providerID: string
  readonly canonical?: string
  readonly modelID?: string
  readonly shape?: "responses" | "completions"
}

export function rewrite<ID extends string>(
  target: Target<ID>,
  input: Context & { readonly specifier: string | undefined },
) {
  if (input.specifier === undefined) return
  const plain = resolve(input.specifier, input)
  if (!plain) return
  const settings = decode(target.settings ?? {})
  const replacement = resolve(input.specifier, { ...input, settings }) ?? plain
  const translated = options(replacement, input.modelID, settings)
  if (target.package !== undefined || replacement !== input.specifier) target.package = replacement
  target.settings =
    target.settings === undefined
      ? undefined
      : {
          ...translated.settings,
          ...(!NATIVE.has(input.specifier) && replacement === "@chassis/ai/providers/openai-compatible"
            ? { provider: input.canonical ?? input.providerID }
            : {}),
        }
  target.headers = Provider.mergeHeaders(translated.headers, target.headers)
  target.body = Provider.mergeOverlay(translated.body, target.body)
  target.variants = target.variants?.map((variant) => {
    const overlay = options(replacement, input.modelID, decode(variant.settings ?? {}))
    const headers = Provider.mergeHeaders(overlay.headers, variant.headers)
    const body = Provider.mergeOverlay(overlay.body, variant.body)
    return {
      id: variant.id,
      ...(variant.settings === undefined ? {} : { settings: overlay.settings }),
      ...(headers === undefined ? {} : { headers }),
      ...(body === undefined ? {} : { body }),
    }
  })
}

const PACKAGES: Readonly<Record<string, string>> = {
  "@ai-sdk/anthropic": "@chassis/ai/providers/anthropic",
}

const NATIVE = new Set([...Object.values(PACKAGES)])

export function native(npm: string, _context: Context & { readonly settings?: Provider.Settings }): string | undefined {
  return PACKAGES[npm]
}

function resolve(specifier: string, context: Context & { readonly settings?: Provider.Settings }): string | undefined {
  const npm = Provider.packageName(specifier)
  if (Provider.isAISDK(specifier) || npm in PACKAGES) return native(npm, context)
  return NATIVE.has(npm) ? npm : undefined
}

type Overlay = {
  readonly settings: Provider.Settings
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: Readonly<Record<string, unknown>>
}

function options(_replacement: string, _modelID: string | undefined, settings: Legacy): Overlay {
  const kept = Struct.omit(settings, ["headers", "extraBody", "useCompletionUrls"])
  return {
    settings: kept,
    ...(settings.headers === undefined ? {} : { headers: settings.headers }),
    ...(settings.extraBody === undefined ? {} : { body: settings.extraBody }),
  }
}


const lenient = <S extends Schema.Top>(schema: S) =>
  Schema.optional(Schema.UndefinedOr(schema).pipe(Schema.catchDecoding(() => Effect.succeed(Option.some(undefined)))))

const Credentials = Schema.Struct({
  accessKeyId: Schema.String,
  secretAccessKey: Schema.String,
  sessionToken: lenient(Schema.String),
  region: lenient(Schema.String),
})

const Legacy = Schema.StructWithRest(
  Schema.Struct({
    apiKey: lenient(Schema.String),
    baseURL: lenient(Schema.String),
    headers: lenient(Schema.Record(Schema.String, Schema.String)),
    extraBody: lenient(Schema.Record(Schema.String, Schema.Unknown)),
    useCompletionUrls: lenient(Schema.Boolean),
    auth: lenient(Schema.Literals(["bearer", "sigv4"])),
    bearerToken: lenient(Schema.String),
    endpoint: lenient(Schema.String),
    region: lenient(Schema.String),
    credentials: lenient(Credentials),
    accessKeyId: lenient(Schema.String),
    secretAccessKey: lenient(Schema.String),
    sessionToken: lenient(Schema.String),
    anthropicBeta: lenient(Schema.Array(Schema.String)),
    serviceTier: lenient(Schema.String),
    reasoningConfig: lenient(
      Schema.Struct({
        type: lenient(Schema.String),
        display: lenient(Schema.String),
        maxReasoningEffort: lenient(Schema.String),
        budgetTokens: lenient(Schema.Number),
      }),
    ),
    additionalModelRequestFields: lenient(
      Schema.StructWithRest(
        Schema.Struct({
          anthropic_beta: lenient(Schema.Array(Schema.String)),
          output_config: lenient(Schema.Record(Schema.String, Schema.Unknown)),
          reasoning: lenient(Schema.Record(Schema.String, Schema.Unknown)),
        }),
        [Schema.Record(Schema.String, Schema.Unknown)],
      ),
    ),
    appName: lenient(Schema.String),
    appUrl: lenient(Schema.String),
    api_keys: lenient(Schema.Record(Schema.String, Schema.String)),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
)
type Legacy = typeof Legacy.Type
const decode = Schema.decodeUnknownSync(Legacy)

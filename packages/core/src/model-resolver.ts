export * as ModelResolver from "./model-resolver.js"

import { makeLocationNode } from "@chassis/util/effect/app-node"
import { HttpOptions, LanguageModel, mergeHttpOptions, ProviderConfigurationError } from "@chassis/ai"
import { Auth } from "@chassis/ai/route"
import { Context, Effect, Layer, Schema, Struct } from "effect"
import { AISDK } from "./aisdk.js"
import { Credential } from "./credential.js"
import { Integration } from "./integration.js"
import { Capabilities, ID, Info, Model, Ref, VariantID } from "./model.js"
import type { RuntimeInfo } from "./model.js"
import { Npm } from "@chassis/util/npm"
import { Provider } from "./provider.js"

export class VariantUnavailableError extends Schema.TaggedError<VariantUnavailableError>()(
  "SessionRunnerModel.VariantUnavailableError",
  {
    providerID: Provider.ID,
    modelID: ID,
    variant: VariantID,
  },
) {
  override get message() {
    return `Variant unavailable for ${this.providerID}/${this.modelID}: ${this.variant}`
  }
}

export class UnsupportedPackageError extends Schema.TaggedError<UnsupportedPackageError>()(
  "SessionRunnerModel.UnsupportedPackageError",
  {
    providerID: Provider.ID,
    modelID: ID,
    package: Schema.String,
  },
) {
  override get message() {
    return `Unsupported package for ${this.providerID}/${this.modelID}: ${this.package}`
  }
}

export const InitializationPhase = Schema.Literals(["load", "init", "construct"])
export type InitializationPhase = typeof InitializationPhase.Type


export class ModelConfigurationError extends Schema.TaggedError<ModelConfigurationError>()(
  "SessionRunnerModel.ModelConfigurationError",
  {
    providerID: Provider.ID,
    modelID: ID,
    package: Schema.String,
    detail: Schema.String,
  },
) {
  override get message() {
    return `Cannot initialize ${this.providerID}/${this.modelID}: ${this.detail}`
  }
}


export class ModelInitializationError extends Schema.TaggedError<ModelInitializationError>()(
  "SessionRunnerModel.ModelInitializationError",
  {
    providerID: Provider.ID,
    modelID: ID,
    package: Schema.String,
    phase: InitializationPhase,
    detail: Schema.String,
  },
) {
  override get message() {
    return `Cannot initialize ${this.providerID}/${this.modelID}: ${this.detail}`
  }
}

export class UnresolvedProviderVariablesError extends Schema.TaggedError<UnresolvedProviderVariablesError>()(
  "SessionRunnerModel.UnresolvedProviderVariablesError",
  {
    providerID: Provider.ID,
    modelID: ID,
    variables: Schema.Array(Schema.String),
  },
) {
  override get message() {
    return `Cannot initialize ${this.providerID}/${this.modelID}: ${this.variables.join(", ")} ${this.variables.length === 1 ? "is" : "are"} required to resolve the provider endpoint`
  }
}

export class UnsupportedCompactionError extends Schema.TaggedError<UnsupportedCompactionError>()(
  "SessionRunnerModel.UnsupportedCompactionError",
  {
    providerID: Provider.ID,
    modelID: ID,
    route: Schema.String,
  },
) {
  override get message() {
    return `Provider compaction is not supported by ${this.providerID}/${this.modelID} (${this.route})`
  }
}

export type Error =
  | VariantUnavailableError
  | UnsupportedPackageError
  | ModelConfigurationError
  | ModelInitializationError
  | UnresolvedProviderVariablesError
  | UnsupportedCompactionError
  | Integration.AuthorizationError

export interface Resolved {
  
  readonly model: LanguageModel
  
  readonly ref: Ref
  
  readonly capabilities: Capabilities
  
  readonly cost: Info["cost"]
  
  readonly limit: Info["limit"]
  
  readonly compaction?: Provider.Compaction
  
  readonly transport?: Provider.Transport
  
  readonly chunkTimeout?: number | false
}

export interface Interface {
  readonly resolve: (requested?: Ref) => Effect.Effect<Resolved | undefined, Error>
  readonly resolveModel: (model: Info, variant?: VariantID) => Effect.Effect<Resolved, Error>
}

export class Service extends Context.Service<Service, Interface>()("@chassis/ModelResolver") {}


export const withVariant = (
  model: Info,
  variantID: VariantID | undefined,
): Effect.Effect<Info, VariantUnavailableError> => {
  const id = variantID === "default" ? undefined : variantID
  const variant = model.variants?.find((item) => item.id === id)
  if (!variant && id !== undefined)
    return Effect.fail(
      new VariantUnavailableError({
        providerID: model.providerID,
        modelID: model.id,
        variant: id,
      }),
    )
  return Effect.succeed(
    variant
      ? {
          ...model,
          settings: Provider.mergeOverlay(model.settings, Provider.modelSettings(variant.settings)),
          headers: Provider.mergeHeaders(model.headers, variant.headers),
          body: Provider.mergeOverlay(model.body, variant.body),
        }
      : model,
  )
}

export interface Dependencies {
  readonly loadPackage?: (specifier: string) => Effect.Effect<Provider.ProviderPackage, Provider.LoadError>
  readonly loadAISDK?: (model: RuntimeInfo) => Effect.Effect<LanguageModel, AISDK.InitError>
}

export const fromCatalogModel = (
  model: RuntimeInfo,
  credential?: Credential.Value,
  dependencies?: Dependencies,
): Effect.Effect<
  LanguageModel,
  | UnsupportedPackageError
  | ModelConfigurationError
  | ModelInitializationError
  | UnresolvedProviderVariablesError
  | UnsupportedCompactionError
> =>
  resolveCatalogModel(model, credential, dependencies).pipe(
    Effect.flatMap((resolved) => validateProviderVariables(model, resolved)),
    Effect.flatMap((resolved) => {
      
      if (
        model.settings?.compaction?.type !== "native" ||
        resolved.route.compact?.trigger ||
        resolved.route.compact?.endpoint
      )
        return Effect.succeed(resolved)
      return Effect.fail(
        new UnsupportedCompactionError({ providerID: model.providerID, modelID: model.id, route: resolved.route.id }),
      )
    }),
  )

const resolveCatalogModel = Effect.fn("ModelResolver.resolveCatalogModel")(function* (
  model: RuntimeInfo,
  credential?: Credential.Value,
  dependencies?: Dependencies,
) {
  const resolved = prepareRuntimeModel(model)
  const configuration = credential?.type === "key" ? credential.configuration : undefined
  const configured = { ...resolved.settings, ...credential?.metadata, ...configuration }
  if (Provider.isAISDK(resolved.package)) {
    const loadAISDK = dependencies?.loadAISDK
    if (!loadAISDK) return yield* unsupported(resolved)
    const settings = yield* prepareProviderSettings(
      resolved,
      Provider.mergeOverlay(resolved.settings, {
        ...nativeCredentialSettings(resolved, resolved.package ?? "", credential),
        ...credential?.metadata,
        ...configuration,
      }) ?? {},
    )
    return yield* loadAISDK({ ...resolved, settings }).pipe(
      Effect.mapError((error) => initialization(resolved, "init", error.cause)),
    )
  }
  const specifier = Provider.packageName(resolved.package)
  if (!specifier) return yield* unsupported(resolved)
  const mapped = yield* prepareProviderSettings(resolved, Provider.nativeSettings(configured))
  const module = yield* (dependencies?.loadPackage ?? Provider.loadPackage)(specifier).pipe(
    Effect.mapError((error) => initialization(resolved, "load", error.cause)),
  )
  const settings = {
    ...(credential ? Struct.omit(mapped, ["accessToken", "apiKey", "authToken"]) : mapped),
    ...(resolved.canonical === undefined ? {} : { provider: resolved.canonical }),
    ...nativeCredentialSettings(resolved, specifier, credential),
    headers: resolved.headers,
    body: resolved.body,
  }
  return yield* Effect.try({
    try: () => {
      const runtime = module.model(resolved.modelID ?? resolved.id, settings)
      return LanguageModel.update(runtime, {
        provider: resolved.canonical ?? resolved.providerID,
        compatibility: resolved.compatibility
          ? Object.assign({}, runtime.compatibility, resolved.compatibility)
          : runtime.compatibility,
        
        defaults: {
          ...runtime.defaults,
          http: mergeHttpOptions(runtime.defaults?.http, new HttpOptions(Provider.timeouts(configured))),
        },
      })
    },
    catch: (cause) =>
      cause instanceof ProviderConfigurationError
        ? new ModelConfigurationError({
            providerID: resolved.providerID,
            modelID: resolved.id,
            package: resolved.package ?? "unknown",
            detail: cause.message,
          })
        : initialization(resolved, "construct", cause),
  })
})

function prepareRuntimeModel(model: RuntimeInfo) {
  if (model.settings?.apiKey !== "") return model
  return { ...model, settings: Struct.omit(model.settings, ["apiKey"]) }
}

function validateProviderVariables(
  model: RuntimeInfo,
  resolved: LanguageModel,
): Effect.Effect<LanguageModel, UnresolvedProviderVariablesError> {
  const baseURL = resolved.route.endpoint.baseURL
  if (typeof baseURL !== "string") return Effect.succeed(resolved)
  const failure = unresolvedProviderVariables(model, baseURL)
  return failure ? Effect.fail(failure) : Effect.succeed(resolved)
}

function prepareProviderSettings(
  model: RuntimeInfo,
  settings: Readonly<Record<string, unknown>>,
): Effect.Effect<Readonly<Record<string, unknown>>, UnresolvedProviderVariablesError> {
  const baseURL = settings.baseURL
  if (typeof baseURL !== "string") return Effect.succeed(settings)
  return prepareProviderURL(model, baseURL).pipe(
    Effect.map((prepared) => (prepared === baseURL ? settings : { ...settings, baseURL: prepared })),
  )
}

function prepareProviderURL(
  model: RuntimeInfo,
  baseURL: string,
): Effect.Effect<string, UnresolvedProviderVariablesError> {
  if (!baseURL.includes("${")) return Effect.succeed(baseURL)
  const prepared = baseURL.replace(/\$\{([^}]+)\}/g, (placeholder, name: string) => process.env[name] ?? placeholder)
  const failure = unresolvedProviderVariables(model, prepared)
  return failure ? Effect.fail(failure) : Effect.succeed(prepared)
}

function unresolvedProviderVariables(model: RuntimeInfo, baseURL: string) {
  const variables = new Set(Array.from(baseURL.matchAll(/\$\{([^}]+)\}/g), (match) => match[1]))
  if (variables.size === 0) return
  return new UnresolvedProviderVariablesError({
    providerID: model.providerID,
    modelID: model.id,
    variables: Array.from(variables),
  })
}

const nativeCredentialSettings = (model: RuntimeInfo, specifier: string, credential: Credential.Value | undefined) => {
  if (!credential) return {}
  if (credential.type === "key") return { apiKey: credential.key }
  if (credential.type === "oauth") return tokenSettings(specifier, credential.access)
  
  if (specifier.startsWith("@chassis/ai/providers/amazon-bedrock")) return { auth: "sigv4" }
  
  
  if (model.providerID === Provider.ID.azure) return tokenSettings(specifier, "azure-cli")
  return {}
}

const tokenSettings = (specifier: string, token: string) => {
  if (specifier === "@chassis/ai/providers/anthropic" || specifier === "@chassis/ai/providers/anthropic-compatible")
    return { authToken: token }
  if (
    specifier === "@chassis/ai/providers/google-vertex" ||
    specifier.startsWith("@chassis/ai/providers/google-vertex/")
  )
    return { accessToken: token }
  return { apiKey: token }
}

const unsupported = (model: RuntimeInfo) =>
  new UnsupportedPackageError({
    providerID: model.providerID,
    modelID: model.id,
    package: model.package ?? "unknown",
  })

const initialization = (model: RuntimeInfo, phase: InitializationPhase, cause: unknown) =>
  new ModelInitializationError({
    providerID: model.providerID,
    modelID: model.id,
    package: model.package ?? "unknown",
    phase,
    detail: causeMessage(cause) ?? `${phase} failed for ${model.package ?? "unknown"}`,
  })


const causeMessage = (cause: unknown): string | undefined => {
  if (typeof cause === "string") return cause.trim() || undefined
  if (!(cause instanceof globalThis.Error)) return undefined
  const message = cause.message.trim()
  if (message) return message
  return causeMessage(cause.cause)
}

export const resolveModel = (
  model: Info,
  variant: VariantID | undefined,
  credential?: Credential.Value,
  dependencies?: Dependencies,
) => withVariant(model, variant).pipe(Effect.flatMap((model) => fromCatalogModel(model, credential, dependencies)))

export const hasPackage = (model: Info) => Boolean(model.package)


export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const providers = yield* Provider.Service
    const models = yield* Model.Service
    const integrations = yield* Integration.Service
    const npm = yield* Npm.Service
    const aisdk = yield* AISDK.Service
    const load = Effect.fn("ModelResolver.resolveModel")(function* (selected: Info, variant?: VariantID) {
      const provider = yield* providers.get(selected.providerID)
      const connection = yield* integrations.connection.active(
        provider?.integrationID ?? Integration.ID.make(selected.providerID),
      )
      const credential = connection ? yield* integrations.connection.resolve(connection) : undefined
      const selectedVariant = yield* withVariant(selected, variant)
      const runtimeInfo: RuntimeInfo = {
        ...selectedVariant,
        settings: Provider.mergeOverlay(provider?.settings, Provider.modelSettings(selectedVariant.settings)),
      }
      const model = yield* fromCatalogModel(runtimeInfo, credential, {
        loadPackage: (specifier) => Provider.loadPackage(specifier, npm),
        loadAISDK: (model) => aisdk.model(model),
      })
      const runtime =
        provider?.activation === "enabled" &&
        credential === undefined &&
        !hasConfiguredAuth(runtimeInfo) &&
        usesAPIKeyAuth(runtimeInfo.package)
          ? LanguageModel.update(model, { route: model.route.with({ auth: Auth.none }) })
          : model
      return {
        model: runtime,
        ref: Ref.make({
          id: selected.id,
          providerID: selected.providerID,
          ...(variant === undefined ? {} : { variant }),
        }),
        capabilities: selected.capabilities,
        cost: selected.cost,
        limit: selected.limit,
        compaction: runtimeInfo.settings?.compaction,
        transport: provider?.settings?.transport,
        chunkTimeout: Provider.timeout(provider?.settings?.chunkTimeout),
      }
    })
    return Service.of({
      resolve: Effect.fn("ModelResolver.resolve")(function* (requested) {
        const selected = requested
          ? yield* models.get(requested.providerID, requested.id)
          : yield* models
              .default()
              .pipe(
                Effect.flatMap((model) =>
                  model && hasPackage(model)
                    ? Effect.succeed(model)
                    : Effect.map(models.available(), (models) =>
                        models.find((model) => hasPackage(model) && Model.supportsText(model)),
                      ),
                ),
              )
        if (!selected) return undefined
        return yield* load(selected, requested?.variant)
      }),
      resolveModel: load,
    })
  }),
)

function hasConfiguredAuth(model: RuntimeInfo) {
  return [model.settings?.apiKey, model.settings?.authToken, model.settings?.accessToken].some(
    (value) => typeof value === "string" && value !== "",
  )
}

function usesAPIKeyAuth(packageName: string | undefined) {
  const name = Provider.packageName(packageName)
  return (
    name === "@ai-sdk/openai" ||
    name === "@ai-sdk/anthropic" ||
    name === "@ai-sdk/cerebras" ||
    name === "@ai-sdk/deepinfra" ||
    name === "@ai-sdk/openai-compatible" ||
    name === "@ai-sdk/google" ||
    name === "@ai-sdk/groq" ||
    name === "@ai-sdk/mistral" ||
    name === "@ai-sdk/togetherai" ||
    name === "@ai-sdk/xai" ||
    name === "@openrouter/ai-sdk-provider" ||
    name === "@ai-sdk/azure" ||
    name === "@chassis/ai/providers/openai" ||
    name?.startsWith("@chassis/ai/providers/openai/") === true ||
    name === "@chassis/ai/providers/anthropic" ||
    name === "@chassis/ai/providers/anthropic-compatible" ||
    name === "@chassis/ai/providers/baseten" ||
    name === "@chassis/ai/providers/cerebras" ||
    name === "@chassis/ai/providers/cloudflare-ai-gateway" ||
    name === "@chassis/ai/providers/cloudflare-workers-ai" ||
    name === "@chassis/ai/providers/deepinfra" ||
    name === "@chassis/ai/providers/deepseek" ||
    name === "@chassis/ai/providers/fireworks" ||
    name === "@chassis/ai/providers/openai-compatible" ||
    name === "@chassis/ai/providers/google" ||
    name === "@chassis/ai/providers/google/interactions" ||
    name === "@chassis/ai/providers/groq" ||
    name === "@chassis/ai/providers/mistral" ||
    name === "@chassis/ai/providers/togetherai" ||
    name === "@chassis/ai/providers/vercel-ai-gateway" ||
    name === "@chassis/ai/providers/xai" ||
    name === "@chassis/ai/providers/openrouter" ||
    name === "@chassis/ai/providers/azure" ||
    name?.startsWith("@chassis/ai/providers/azure/") === true
  )
}

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Provider.node, Model.node, Integration.node, Npm.node, AISDK.node],
})

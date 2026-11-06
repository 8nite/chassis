import type { Config, Redacted } from "effect"
import { Auth } from "./auth.js"

export type ApiKeyMode = "optional" | "required"

export type AuthOverride = {
  readonly auth: Auth.Definition
  readonly apiKey?: never
}

export type OptionalApiKeyAuth = {
  readonly apiKey?: string | Redacted.Redacted<string> | Config.Config<string | Redacted.Redacted<string>>
  readonly auth?: never
}

export type RequiredApiKeyAuth = {
  readonly apiKey: string | Redacted.Redacted<string> | Config.Config<string | Redacted.Redacted<string>>
  readonly auth?: never
}

export type ProviderAuthOption<Mode extends ApiKeyMode> =
  | AuthOverride
  | (Mode extends "optional" ? OptionalApiKeyAuth : RequiredApiKeyAuth)

export type LanguageModelOptions<Base, Mode extends ApiKeyMode> = Omit<Base, "apiKey" | "auth"> &
  ProviderAuthOption<Mode>

export type LanguageModelArgs<Base, Mode extends ApiKeyMode> = Mode extends "optional"
  ? readonly [options?: LanguageModelOptions<Base, Mode>]
  : readonly [options: LanguageModelOptions<Base, Mode>]

export type LanguageModelFactory<Base, Mode extends ApiKeyMode, LanguageModel> = (
  id: string,
  ...args: LanguageModelArgs<Base, Mode>
) => LanguageModel


export type AtLeastOne<T> = {
  [K in keyof T]: Required<Pick<T, K>> & Partial<Omit<T, K>>
}[keyof T]


export const bearer = (
  options: ProviderAuthOption<"optional">,
  envVar: string | ReadonlyArray<string>,
): Auth.Definition => {
  if ("auth" in options && options.auth) return options.auth
  return (Array.isArray(envVar) ? envVar : [envVar])
    .reduce(
      (auth, name) => auth.orElse(Auth.config(name)),
      Auth.optional("apiKey" in options ? options.apiKey : undefined, "apiKey"),
    )
    .bearer()
}

export * as AuthOptions from "./auth-options.js"

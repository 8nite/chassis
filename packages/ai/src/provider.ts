import type { LanguageModel, ModelID, ProviderID } from "./schema/index.js"

export type LanguageModelOptions = Pick<LanguageModel.Input, "defaults" | "compatibility">


export type LanguageModelFactory<Options extends LanguageModelOptions = LanguageModelOptions> = (
  id: string | ModelID,
  options?: Options,
) => LanguageModel

type AnyLanguageModelFactory = (...args: never[]) => LanguageModel

export interface Definition<Factory extends AnyLanguageModelFactory = LanguageModelFactory> {
  readonly id: ProviderID
  readonly model: Factory
  readonly apis?: Record<string, AnyLanguageModelFactory>
}

type DefinitionShape = {
  readonly id: ProviderID
  readonly model: (...args: never[]) => LanguageModel
  readonly apis?: Record<string, (...args: never[]) => LanguageModel>
}

type NoExtraFields<Input, Shape> = Input & Record<Exclude<keyof Input, keyof Shape>, never>

export const make = <DefinitionType extends DefinitionShape>(
  definition: NoExtraFields<DefinitionType, DefinitionShape>,
) => definition

export * as Provider from "./provider.js"

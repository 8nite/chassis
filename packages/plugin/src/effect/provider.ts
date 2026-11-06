import type { ProviderApi } from "@chassis/client/effect/api"
import type { Model } from "@chassis/schema/model"
import type { Provider } from "@chassis/schema/provider"
import type { ConnectionInfo } from "@chassis/client"
import type { Effect, Types } from "effect"
import type { Transform } from "./registration.js"


export interface ProviderRecord {
  readonly provider: Provider.Info
  readonly models: ReadonlyMap<string, Model.Info>
  readonly sourceConnection?: ConnectionInfo
}

export interface ProviderEditor {
  list(): readonly ProviderRecord[]
  get(providerID: string): ProviderRecord | undefined
  
  add(input: { info: Provider.Info; models: readonly Model.Info[]; sourceConnection?: ConnectionInfo }): void
  update(providerID: string, update: (provider: Types.DeepMutable<Provider.Info>) => void): void
  remove(providerID: string): void
  readonly models: {
    set(providerID: string, models: readonly Model.Info[]): void
    
    update(providerID: string, modelID: string, update: (model: Types.DeepMutable<Model.Info>) => void): void
    remove(providerID: string, modelID: string): void
  }
}

export interface ProviderDomain extends ProviderApi<unknown> {
  readonly transform: Transform<ProviderEditor>
  readonly reload: () => Effect.Effect<void>
}

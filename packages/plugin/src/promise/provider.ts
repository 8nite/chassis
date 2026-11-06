import type { ProviderApi } from "@chassis/client/promise/api"
import type { Model } from "@chassis/schema/model"
import type { Provider } from "@chassis/schema/provider"
import type { ConnectionInfo } from "@chassis/client"
import type { Transform } from "./registration.js"
import type { DeepMutable } from "./types.js"


export interface ProviderRecord {
  readonly provider: Provider.Info
  readonly models: ReadonlyMap<string, Model.Info>
  readonly sourceConnection?: ConnectionInfo
}

export interface ProviderEditor {
  list(): readonly ProviderRecord[]
  get(providerID: string): ProviderRecord | undefined
  
  add(input: { info: Provider.Info; models: readonly Model.Info[]; sourceConnection?: ConnectionInfo }): void
  update(providerID: string, update: (provider: DeepMutable<Provider.Info>) => void): void
  remove(providerID: string): void
  readonly models: {
    set(providerID: string, models: readonly Model.Info[]): void
    
    update(providerID: string, modelID: string, update: (model: DeepMutable<Model.Info>) => void): void
    remove(providerID: string, modelID: string): void
  }
}

export interface ProviderDomain extends ProviderApi {
  readonly transform: Transform<ProviderEditor>
  readonly reload: () => Promise<void>
}

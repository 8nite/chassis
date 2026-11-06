import type { ModelApi } from "@chassis/client/promise/api"
import type { Model } from "@chassis/schema/model"
import type { ProviderRecord } from "./provider.js"
import type { Transform } from "./registration.js"
import type { DeepMutable } from "./types.js"

export interface ModelEditor {
  
  list(providerID?: string): readonly DeepMutable<Model.Info>[]
  get(providerID: string, modelID: string): DeepMutable<Model.Info> | undefined
  
  update(providerID: string, modelID: string, update: (model: DeepMutable<Model.Info>) => void): void
  remove(providerID: string, modelID: string): void
  readonly default: {
    get(): { providerID: string; modelID: string } | undefined
    set(providerID: string, modelID: string): void
  }
  
  readonly provider: {
    list(): readonly ProviderRecord[]
    get(providerID: string): ProviderRecord | undefined
  }
}

export interface ModelDomain extends ModelApi {
  readonly transform: Transform<ModelEditor>
  readonly reload: () => Promise<void>
}

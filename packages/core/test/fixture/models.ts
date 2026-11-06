import { ModelsDev } from "@chassis/core/models-dev"




export const offlineModels = ModelsDev.node.replace(ModelsDev.configured({ fetch: false }))

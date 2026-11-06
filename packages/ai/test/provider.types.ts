import { Provider } from "../src/provider.js"
import { ProviderID, type LanguageModel } from "../src/schema/index.js"

declare const model: (id: string) => LanguageModel
declare const requiredModel: (id: string, options: { readonly baseURL: string }) => LanguageModel
declare const chat: (id: string, options: { readonly apiKey: string }) => LanguageModel

Provider.make({
  id: ProviderID.make("example"),
  model,
})

Provider.make({
  id: ProviderID.make("bad"),
  model,
  
  routes: [],
})

const requiredProvider = Provider.make({
  id: ProviderID.make("required"),
  model: requiredModel,
})



requiredProvider.model("custom", { baseURL: "https://example.com/v1" })


requiredProvider.model("custom")

const multiApiProvider = Provider.make({
  id: ProviderID.make("multi-api"),
  model,
  apis: { chat },
})

multiApiProvider.apis.chat("chat-model", { apiKey: "key" })


multiApiProvider.apis.chat("chat-model")

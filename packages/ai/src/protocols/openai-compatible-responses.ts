import { Route, type RouteRoutedLanguageModelInput } from "../route/client.js"
import { Endpoint } from "../route/endpoint.js"
import { OpenResponses } from "./open-responses.js"

const ADAPTER = "openai-compatible-responses"

export type OpenAICompatibleResponsesLanguageModelInput = RouteRoutedLanguageModelInput


export const route = Route.make({
  id: ADAPTER,
  providerMetadataKey: "openresponses",
  protocol: OpenResponses.protocol,
  endpoint: Endpoint.path(OpenResponses.PATH),
  transport: OpenResponses.httpTransport,
  defaults: { providerOptions: { store: false, include: ["reasoning.encrypted_content"] } },
})

export * as OpenAICompatibleResponses from "./openai-compatible-responses.js"

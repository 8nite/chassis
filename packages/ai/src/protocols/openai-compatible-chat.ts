import { Route, type RouteRoutedLanguageModelInput } from "../route/client.js"
import { Endpoint } from "../route/endpoint.js"
import * as OpenAIChat from "./openai-chat.js"

const ADAPTER = "openai-compatible-chat"

export type OpenAICompatibleChatLanguageModelInput = RouteRoutedLanguageModelInput


export const route = Route.make({
  id: ADAPTER,
  providerMetadataKey: "openai",
  protocol: OpenAIChat.protocol,
  endpoint: Endpoint.path("/chat/completions"),
  framing: OpenAIChat.framing,
})

export * as OpenAICompatibleChat from "./openai-compatible-chat.js"

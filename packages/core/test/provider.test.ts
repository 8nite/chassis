import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Provider } from "@chassis/core/provider"

describe("Provider", () => {
  test("loads bundled native provider entrypoints", async () => {
    const packages = [
      "@chassis/ai/providers/baseten",
      "@chassis/ai/providers/cerebras",
      "@chassis/ai/providers/cloudflare-ai-gateway",
      "@chassis/ai/providers/cloudflare-workers-ai",
      "@chassis/ai/providers/cohere",
      "@chassis/ai/providers/cohere/chat",
      "@chassis/ai/providers/deepinfra",
      "@chassis/ai/providers/deepseek",
      "@chassis/ai/providers/fireworks",
      "@chassis/ai/providers/google-vertex",
      "@chassis/ai/providers/google-vertex/gemini",
      "@chassis/ai/providers/google-vertex/interactions",
      "@chassis/ai/providers/google-vertex/chat",
      "@chassis/ai/providers/google-vertex/responses",
      "@chassis/ai/providers/google-vertex/messages",
      "@chassis/ai/providers/groq",
      "@chassis/ai/providers/mistral",
      "@chassis/ai/providers/togetherai",
      "@chassis/ai/providers/vercel-ai-gateway",
    ]

    for (const specifier of packages) {
      const loaded = await Effect.runPromise(Provider.loadPackage(specifier))
      expect(loaded.model).toBeFunction()
    }
  })

  test("passes flat settings to native packages without Core settings", () => {
    expect(
      Provider.nativeSettings({
        apiKey: "secret",
        reasoningEffort: "high",
        chunkTimeout: 1000,
        compaction: { type: "native" },
        transport: "websocket",
      }),
    ).toEqual({
      apiKey: "secret",
      reasoningEffort: "high",
    })
  })

  test("inherits shared and loose settings without provider-only policies", () => {
    expect(
      Provider.modelSettings({
        timeout: 60_000,
        chunkTimeout: 30_000,
        transport: "websocket",
        compaction: { type: "native" },
        reasoningEffort: "high",
      }),
    ).toEqual({
      compaction: { type: "native" },
      reasoningEffort: "high",
    })
  })
})

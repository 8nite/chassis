import { Config, Effect, Formatter, Schema, Stream } from "effect"
import { NodeFileSystem } from "@effect/platform-node"
import { AIClient, Image, LLM, LLMRequest, Media, Message, ProviderID, Tool, ToolRuntime } from "@chassis/ai"
import { Route, Auth, Endpoint, Framing, Protocol } from "@chassis/ai/route"
import { OpenAI } from "@chassis/ai/providers"



const apiKey = Config.Redacted("OPENAI_API_KEY")





const openai = OpenAI.configure({
  apiKey,
  generation: { maxTokens: 160 },
  providerOptions: {
    store: false,
  },
})
const model = openai.responses("gpt-4o-mini")
















const request = LLM.request({
  model,
  system: "You are concise and practical.",
  prompt: "Tell me a joke",
  generation: { maxTokens: 80, temperature: 0.7 },
  promptCacheKey: "tutorial-joke",
})



const generateOnce = Effect.gen(function* () {
  const response = yield* LLM.generate(request)

  console.log("\n== generate ==")
  console.log("generated text:", response.text)
  console.log("usage", Formatter.formatJson(response.usage, { space: 2 }))
})



const streamText = LLM.stream(request).pipe(
  Stream.tap((event) =>
    Effect.sync(() => {
      if (event.type === "text-delta") process.stdout.write(`\ntext: ${event.text}`)
      if (event.type === "finish")
        process.stdout.write(
          `\nfinish: ${event.reason.normalized}${event.reason.raw ? ` (${event.reason.raw})` : ""}\n`,
        )
    }),
  ),
  Stream.runDrain,
)




const tools = {
  get_weather: Tool.make({
    description: "Get current weather for a city.",
    parameters: Schema.Struct({ city: Schema.String }),
    success: Schema.Struct({ forecast: Schema.String }),
    execute: (input) => Effect.succeed({ forecast: `${input.city}: sunny, 72F` }),
  }),
}

const streamWithTools = Effect.gen(function* () {
  const request = LLM.request({
    model,
    prompt: "Use get_weather for San Francisco, then answer in one sentence.",
    generation: { maxTokens: 80, temperature: 0 },
    tools: Tool.toDefinitions(tools),
  })
  const events = Array.from(yield* LLM.stream(request).pipe(Stream.runCollect))
  for (const event of events) {
    if (event.type === "tool-call") console.log("tool call", event.name, event.input)
    if (event.type === "text-delta") process.stdout.write(event.text)
    if (event.type !== "tool-call" || event.providerExecuted) continue
    const dispatched = yield* ToolRuntime.dispatch(tools, event)
    console.log("tool result", event.name, dispatched.result)

    
    
    const followUp = LLMRequest.update(request, {
      messages: [
        ...request.messages,
        Message.assistant([event]),
        Message.tool({ ...event, result: dispatched.result }),
      ],
    })
    console.log("follow-up history messages:", followUp.messages.length)
  }
})




const WeatherReport = Schema.Struct({
  city: Schema.String,
  forecast: Schema.String,
  highFahrenheit: Schema.Number,
})

const generateStructuredObject = Effect.gen(function* () {
  const response = yield* LLM.generateObject({
    model,
    system: "Return only structured weather data.",
    prompt: "Give me today's weather for San Francisco.",
    schema: WeatherReport,
    generation: { maxTokens: 120, temperature: 0 },
  })

  console.log("\n== generateObject ==")
  console.log(Formatter.formatJson(response.object, { space: 2 }))
})



const generateDynamicObject = LLM.generateObject({
  model,
  prompt: "Extract the city and forecast from: San Francisco is sunny.",
  jsonSchema: {
    type: "object",
    properties: {
      city: { type: "string" },
      forecast: { type: "string" },
    },
    required: ["city", "forecast"],
  },
})








const FakeBody = Schema.Struct({
  model: Schema.String,
  input: Schema.String,
})
type FakeBody = Schema.Schema.Type<typeof FakeBody>

const FakeProtocol = Protocol.make<FakeBody, string, string, void>({
  
  
  id: "fake-echo",
  body: {
    schema: FakeBody,
    from: (request) =>
      Effect.succeed({
        model: request.model.id,
        input: request.messages
          .flatMap((message) => message.content)
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n"),
      }),
  },
  stream: {
    event: Schema.String,
    initial: () => undefined,
    step: (_, frame) => Effect.succeed([undefined, [{ type: "text-delta", id: "text-0", text: frame }]] as const),
    onHalt: () => [{ type: "finish", reason: { normalized: "stop" } }],
  },
})



const FakeAdapter = Route.make({
  id: "fake-echo",
  provider: "fake-echo",
  protocol: FakeProtocol,
  endpoint: Endpoint.path("/v1/echo", { baseURL: "https://fake.local" }),
  auth: Auth.passthrough,
  framing: Framing.sse,
})



const FakeEcho = {
  id: ProviderID.make("fake-echo"),
  configure: () => ({
    id: ProviderID.make("fake-echo"),
    model: (id: string) => FakeAdapter.model({ id }),
  }),
}




const generateImage = Effect.gen(function* () {
  const response = yield* Image.generate({
    model: openai.image("gpt-image-1-mini"),
    prompt: "A flat black circle centered on a plain white background.",
    size: "1024x1024",
    format: "jpeg",
    providerOptions: { quality: "low" },
  })

  console.log("\n== image ==")
  console.log("media type:", response.image.mediaType)
  console.log("bytes:", (yield* response.image.bytes()).byteLength)
  console.log("usage", Formatter.formatJson(response.usage, { space: 2 }))
  yield* Media.write(response.image, "tutorial-image.jpg").pipe(Effect.provide(NodeFileSystem.layer))
})






const program = Effect.gen(function* () {
  
  
  
  
  
  yield* streamWithTools
}).pipe(Effect.provide(AIClient.layer))

Effect.runPromise(program)

import { Schema } from "effect"
import type { CacheHint } from "../../schema/index.js"
import { newBreakpoints, ttlBucket } from "./cache.js"




export const CachePointBlock = Schema.Struct({
  cachePoint: Schema.Struct({
    type: Schema.tag("default"),
    ttl: Schema.optional(Schema.Literals(["5m", "1h"])),
  }),
})
export type CachePointBlock = Schema.Schema.Type<typeof CachePointBlock>

const LEGACY_CLAUDE = ["anthropic.claude-instant", "anthropic.claude-v1", "anthropic.claude-v2", "anthropic.claude-3-"]


const CLAUDE_5M = [
  "anthropic.claude-3-5-sonnet-20241022-v2:0",
  "anthropic.claude-3-5-haiku-20241022-v1:0",
  "anthropic.claude-3-7-sonnet-20250219-v1:0",
  "anthropic.claude-sonnet-4-20250514-v1:0",
  "anthropic.claude-opus-4-20250514-v1:0",
  "anthropic.claude-opus-4-1-20250805-v1:0",
]


export const BEDROCK_BREAKPOINT_CAP = 4

export const breakpoints = (modelID: string) => {
  
  const short = CLAUDE_5M.some((id) => modelID.includes(id))
  return {
    ...newBreakpoints(BEDROCK_BREAKPOINT_CAP),
    
    
    supported: modelID.includes("anthropic.claude-") && (short || !LEGACY_CLAUDE.some((id) => modelID.includes(id))),
    ttl1h: !short,
  }
}
export type Breakpoints = ReturnType<typeof breakpoints>

const DEFAULT_5M: CachePointBlock = { cachePoint: { type: "default" } }
const DEFAULT_1H: CachePointBlock = { cachePoint: { type: "default", ttl: "1h" } }

export const block = (breakpoints: Breakpoints, cache: CacheHint | undefined): CachePointBlock | undefined => {
  if (!breakpoints.supported) return undefined
  if (cache?.type !== "ephemeral" && cache?.type !== "persistent") return undefined
  if (breakpoints.remaining <= 0) {
    breakpoints.dropped += 1
    return undefined
  }
  breakpoints.remaining -= 1
  return breakpoints.ttl1h && ttlBucket(cache.ttlSeconds) === "1h" ? DEFAULT_1H : DEFAULT_5M
}

export * as BedrockCache from "./bedrock-cache.js"

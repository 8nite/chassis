export * as McpCodeModeDefaultsPlugin from "./mcp-codemode-defaults.js"

import { define } from "@chassis/plugin/effect/plugin"
import { Effect } from "effect"





const urls = [/^https:\/\/executor\.sh\/[^/]+\/mcp$/]




const posthog = /^mcp(?:-eu|\.us|\.eu)?\.posthog\.com$/
const mode = "x-posthog-mcp-mode"

export const Plugin = define({
  id: "chassis.mcp.codemode.defaults",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.mcp.transform((editor) => {
      for (const [, server] of editor.list()) {
        if (server.codemode !== undefined) continue
        if (server.type === "local") {
          if (server.command[0] === "executor" && server.command[1] === "mcp") server.codemode = false
          continue
        }
        if (!URL.canParse(server.url)) continue
        const url = new URL(server.url)
        const endpoint = `${url.origin}${url.pathname.replace(/\/+$/, "")}`
        if (urls.some((pattern) => pattern.test(endpoint))) server.codemode = false
        if (
          posthog.test(url.hostname) &&
          !url.searchParams.has("mode") &&
          !Object.keys(server.headers ?? {}).some((key) => key.toLowerCase() === mode)
        )
          server.headers = { ...server.headers, [mode]: "tools" }
      }
    })
  }),
})

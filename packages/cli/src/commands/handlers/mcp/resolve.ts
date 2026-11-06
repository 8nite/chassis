import { Effect } from "effect"
import type { ChassisClient } from "@chassis/client"





export const resolveIntegration = (client: ChassisClient, name: string, location: { directory: string }) =>
  Effect.gen(function* () {
    const servers = yield* Effect.promise(() => client.mcp.list({ location }))
    const server = servers.data.find((entry) => entry.name === name)
    if (!server) return yield* Effect.fail(new Error(`MCP server not found: ${name}`))
    const integrationID = server.integrationID
    if (!integrationID) return undefined
    return yield* Effect.promise(() => client.integration.get({ integrationID, location })).pipe(
      Effect.map((result) => result.data ?? undefined),
    )
  })

import type { NewSessionResponse, PromptResponse } from "@agentclientprotocol/sdk"
import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { createAcpFixture, expectOk, initialize, toolCallStream } from "./subprocess"


function readingModel(file: () => string) {
  return (request: unknown) => {
    if (JSON.stringify(request).includes('"role":"tool"')) return "done"
    return toolCallStream("call_read", "read", { path: file() })
  }
}

describe("acp additional directories subprocess", () => {
  test("tools read files in an additional directory without an external directory ask", async () => {
    const target = { file: "" }
    await using fixture = await createAcpFixture({ respond: readingModel(() => target.file) })
    
    const shared = path.join(fixture.root, "shared")
    target.file = path.join(shared, "notes.txt")
    await fs.mkdir(shared)
    await Bun.write(target.file, "shared root content\n")
    const acp = fixture.spawn()
    await initialize(acp)
    const session = expectOk(
      await acp.request<NewSessionResponse>("session/new", {
        cwd: fixture.home,
        additionalDirectories: [shared],
        mcpServers: [],
      }),
    )

    const result = expectOk(
      await acp.request<PromptResponse>("session/prompt", {
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: "read the shared notes" }],
      }),
    )

    expect(result.stopReason).toBe("end_turn")
    expect(JSON.stringify(fixture.llm.requests.at(-1))).toContain("shared root content")
  }, 60_000)
})

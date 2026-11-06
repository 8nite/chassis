import { describe, expect, test } from "bun:test"
import type { BunPlugin } from "bun"
import { join } from "path"






const externalizeBare: BunPlugin = {
  name: "externalize-bare",
  setup(build) {
    build.onResolve({ filter: /^[^.#/]/ }, (args) => ({ path: args.path, external: true }))
  },
}

const bundle = async (conditions: Array<string>) => {
  const result = await Bun.build({
    
    
    entrypoints: [join(import.meta.dir, "../src/database/database.ts")],
    target: "browser",
    conditions,
    plugins: [externalizeBare],
    throw: false,
  })
  expect(result.logs).toEqual([])
  expect(result.success).toBe(true)
  return result.outputs[0].text()
}





describe.skipIf(process.platform === "win32")("sqlite bundle conditions", () => {
  test("workerd conditions select the Durable Object driver and never bun:sqlite", async () => {
    const output = await bundle(["workerd"])
    expect(output).not.toContain("bun:sqlite")
    expect(output).not.toContain("node:sqlite")
    expect(output).toContain("SqliteWorkerd")
  })

  test("default conditions fall back to node:sqlite, not bun:sqlite", async () => {
    const output = await bundle([])
    expect(output).not.toContain("bun:sqlite")
    expect(output).toContain("SqliteNode")
  })
})

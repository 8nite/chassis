
import { test } from "bun:test"
import { root, run, skipped } from "./test262/run.js"

for (const file of [...new Bun.Glob("**/*.js").scanSync({ cwd: root })].sort()) {
  const define = skipped.has(file) ? test.skip : test
  define(
    file,
    async () => {
      const outcome = await run(file)
      if (outcome.status === "fail") throw new Error(outcome.reason)
    },
    10_000,
  )
}

import { plugin } from "bun"
import { ensureSolidTransformPlugin } from "@opentui/solid/bun-plugin"

ensureSolidTransformPlugin()
if (process.argv[2] !== "serve") {
  
  const { run } = await import("./tui")
  plugin({
    name: "vite-tui-entry",
    setup(build) {
      build.module("@chassis/tui", () => ({ loader: "object", exports: { run } }))
    },
  })
}
await import("../src/index")


import { host } from "@chassis/cli/vite-host"
import { configureErrorOverlay } from "./refresh"

if (import.meta.hot) {
  import.meta.hot.on("vite:afterUpdate", () => queueMicrotask(() => host.settle?.()))
  import.meta.hot.on("vite:beforeFullReload", async () => {
    await host.stop?.()
    host.reset?.()
  })
}

const { run } = await import("../../tui/src/index")

const { ErrorOverlay } = await import("./error-overlay")
configureErrorOverlay(ErrorOverlay)
await host.mount?.(run)

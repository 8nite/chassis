import type { Definition } from "@chassis/gui-extensions/sdk"
import { builtins } from "@chassis/gui-extensions/renderer"

export { builtins }


export const BUILTINS_UPDATED = "chassis:gui-extensions-updated"


if (import.meta.hot)
  import.meta.hot.accept("@chassis/gui-extensions/renderer", (module) => {
    const next: readonly Definition[] | undefined = module?.builtins

    if (next) window.dispatchEvent(new CustomEvent(BUILTINS_UPDATED, { detail: next }))
  })

import { createMemo, createResource, onCleanup } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import type { Bridge, Installed } from "@chassis/gui-extensions/sdk/bridge"


export function createInstalled(bridge: Bridge | undefined) {
  const [state, setState] = createStore<{ list?: readonly Installed[] }>({})
  
  const pushed = { count: 0 }
  const [initial] = createResource(async () => (bridge ? bridge.manager.initial?.catch(() => undefined) : []))

  
  createResource(async () => {
    if (!bridge) return

    const seen = pushed.count
    const list = await bridge.manager.list()

    if (pushed.count === seen) setState("list", reconcile([...list]))
  })

  if (bridge)
    onCleanup(
      bridge.on((message) => {
        if (message.type !== "extensions") return
        pushed.count++
        setState("list", reconcile([...message.list]))
      }),
    )

  return {
    enableState: createMemo(() => state.list ?? initial.latest),
    list: () => state.list ?? [],
  }
}

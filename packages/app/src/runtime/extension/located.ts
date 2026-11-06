import { batch, createEffect, createSignal, untrack } from "solid-js"
import type { SessionRef } from "@chassis/gui-extensions/sdk"


export function createLocatedWrites() {
  const [pending, setPending] = createSignal<readonly { readonly session: SessionRef; readonly run: () => void }[]>([])
  
  createEffect(() => {
    const held = pending()

    if (held.length === 0) return
    const located = held.filter((item) => item.session.location)

    if (located.length === 0) return
    setPending(held.filter((item) => !located.includes(item)))
    untrack(() => batch(() => located.forEach((item) => item.run())))
  })

  return {
    hold(session: SessionRef, run: () => void) {
      setPending((held) => [...held, { session, run }])
    },
  }
}

import { createMemo, createRenderEffect, createSignal, on, onCleanup } from "solid-js"
import { sessionNotFoundError } from "@/runtime/server/errors"

type SessionStore<T> = {
  get: (id: string) => T | undefined
  sync: (id: string, options?: { children?: boolean }) => Promise<unknown>
  message: {
    sync: (id: string) => Promise<unknown>
  }
  pending: {
    sync: (id: string) => Promise<unknown>
  }
}

type Resolution<T> = { id: string; store: SessionStore<T> } & (
  | { state: "pending" }
  | { state: "settled" }
  | { state: "failed"; failure: unknown }
)

















export function createSessionResolution<T>(
  sessionID: () => string | undefined,
  sessions: () => SessionStore<T>,
  options?: { children?: boolean; connected?: () => boolean },
) {
  const cached = createMemo(() => {
    const id = sessionID()

    if (!id) return

    return sessions().get(id)
  })

  const [status, setStatus] = createSignal<Resolution<T>>()

  
  
  createRenderEffect(
    on([sessionID, sessions, () => options?.connected?.() ?? true] as const, ([id, store, connected]) => {
      if (!id || !connected) return
      let stale = false
      onCleanup(() => {
        stale = true
      })
      
      
      
      void store.message.sync(id).catch(() => undefined)
      void store.pending.sync(id).catch(() => undefined)

      if (cached() && !options?.children && !options?.connected) {
        setStatus({ id, store, state: "settled" })

        return
      }

      setStatus({ id, store, state: "pending" })
      store
        .sync(id, options)
        .then(() => {
          if (!stale) setStatus({ id, store, state: "settled" })
        })
        .catch((failure) => {
          if (!stale) setStatus({ id, store, state: "failed", failure })
        })
    }),
  )

  return createMemo(() => {
    const id = sessionID()

    if (!id) return
    const value = cached()

    if (value) return value
    const state = status()

    if (!state || state.id !== id || state.store !== sessions()) return undefined

    if (state.state === "failed") throw state.failure

    
    
    
    if (state.state === "settled") throw sessionNotFoundError(id)

    return undefined
  })
}

import { expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { createSessionResolution } from "@/session/session-resolution"

type Session = { id: string; directory: string }

const sessionOf = (id: string): Session => ({ id, directory: `/dir/${id}` })






function createFixture(initial: Record<string, Session> = {}) {
  const [cache, setCache] = createSignal(initial)
  const deferred = new Map<string, PromiseWithResolvers<unknown>>()
  const resolves: string[] = []
  const messages = { syncs: [] as string[], ...Promise.withResolvers<unknown>() }
  const pending = { syncs: [] as string[] }

  return {
    resolves,
    messages,
    pending,
    sessions: {
      get: (id: string) => cache()[id],
      sync: (id: string) => {
        resolves.push(id)
        const entry = deferred.get(id) ?? Promise.withResolvers<unknown>()
        deferred.set(id, entry)

        return entry.promise
      },
      message: {
        sync: (id: string) => {
          messages.syncs.push(id)

          return messages.promise
        },
      },
      pending: {
        sync: (id: string) => {
          pending.syncs.push(id)

          return Promise.resolve()
        },
      },
    },
    settle(id: string, directory = `/dir/${id}`) {
      setCache({ ...cache(), [id]: { id, directory } })
      deferred.get(id)?.resolve(undefined)
      deferred.delete(id)
    },
    fail(id: string, error: unknown) {
      deferred.get(id)?.reject(error)
      
      
      deferred.delete(id)
    },
    remove(id: string) {
      const next = { ...cache() }
      delete next[id]
      setCache(next)
    },
  }
}



const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

test("refreshes the current session on reconnect while keeping cached content visible", async () => {
  await createRoot(async (dispose) => {
    const fixture = createFixture({ ses_a: sessionOf("ses_a") })
    const [connection, setConnection] = createStore({ connected: false })

    const current = createSessionResolution(
      () => "ses_a",
      () => fixture.sessions,
      { connected: () => connection.connected },
    )

    expect(current()).toEqual(sessionOf("ses_a"))
    expect(fixture.resolves).toEqual([])
    await flush()
    setConnection("connected", true)
    expect(fixture.resolves).toEqual(["ses_a"])
    fixture.settle("ses_a")
    await flush()

    setConnection("connected", false)
    expect(current()).toEqual(sessionOf("ses_a"))
    expect(fixture.resolves).toEqual(["ses_a"])
    setConnection("connected", true)
    expect(fixture.resolves).toEqual(["ses_a", "ses_a"])
    expect(current()).toEqual(sessionOf("ses_a"))
    expect(fixture.messages.syncs).toEqual(["ses_a", "ses_a"])
    expect(fixture.pending.syncs).toEqual(["ses_a", "ses_a"])
    fixture.settle("ses_a", "/worktrees/moved")
    await flush()
    expect(current()?.directory).toBe("/worktrees/moved")
    dispose()
  })
})

test("starts metadata and messages in parallel once the route has a session ID", async () => {
  await createRoot(async (dispose) => {
    const fixture = createFixture()
    const [id, setId] = createSignal<string>()
    const current = createSessionResolution(id, () => fixture.sessions)

    expect(current()).toBeUndefined()
    await flush()
    expect(fixture.resolves).toEqual([])
    expect(fixture.messages.syncs).toEqual([])

    setId("ses_a")
    expect(fixture.resolves).toEqual(["ses_a"])
    expect(fixture.messages.syncs).toEqual(["ses_a"])

    fixture.messages.resolve(undefined)
    await flush()
    expect(current()).toBeUndefined()

    fixture.settle("ses_a")
    await flush()
    expect(current()?.id).toBe("ses_a")

    dispose()
  })
})

test("message failure does not fail metadata resolution", async () => {
  await createRoot(async (dispose) => {
    const fixture = createFixture()

    const current = createSessionResolution(
      () => "ses_a",
      () => fixture.sessions,
    )

    await flush()
    fixture.messages.reject(new Error("message sync failed"))
    await flush()
    expect(current()).toBeUndefined()

    fixture.settle("ses_a")
    await flush()
    expect(current()?.id).toBe("ses_a")

    dispose()
  })
})




test("re-resolves when navigating to an uncached session without a remount", async () => {
  await createRoot(async (dispose) => {
    const fixture = createFixture({ ses_a: sessionOf("ses_a") })
    const [id, setId] = createSignal("ses_a")
    const current = createSessionResolution(id, () => fixture.sessions)

    await flush()
    expect(current()?.id).toBe("ses_a")
    expect(fixture.resolves).toEqual([])
    expect(fixture.messages.syncs).toEqual(["ses_a"])

    expect(() => {
      setId("ses_b")
      current()
    }).not.toThrow()
    expect(fixture.resolves).toEqual(["ses_b"])
    expect(fixture.messages.syncs).toEqual(["ses_a", "ses_b"])

    fixture.settle("ses_b")
    await flush()
    expect(current()?.id).toBe("ses_b")

    dispose()
  })
})



test("ignores a stale resolution failure after the target changes", async () => {
  await createRoot(async (dispose) => {
    const fixture = createFixture()
    const [id, setId] = createSignal("ses_a")
    const current = createSessionResolution(id, () => fixture.sessions)

    await flush()
    setId("ses_b")
    fixture.fail("ses_a", new Error("Session not found: ses_a"))
    await flush()

    expect(() => current()).not.toThrow()
    fixture.settle("ses_b")
    await flush()
    expect(current()?.id).toBe("ses_b")

    dispose()
  })
})

test("returning to a pruned session re-resolves instead of throwing not found", async () => {
  await createRoot(async (dispose) => {
    const fixture = createFixture()
    const [id, setId] = createSignal("ses_a")
    const current = createSessionResolution(id, () => fixture.sessions)

    await flush()
    fixture.settle("ses_a")
    await flush()

    setId("ses_b")
    fixture.settle("ses_b")
    await flush()

    fixture.remove("ses_a")
    expect(() => {
      setId("ses_a")
      current()
    }).not.toThrow()
    expect(fixture.resolves).toEqual(["ses_a", "ses_b", "ses_a"])
    expect(fixture.messages.syncs).toEqual(["ses_a", "ses_b", "ses_a"])

    fixture.settle("ses_a")
    await flush()
    expect(current()?.id).toBe("ses_a")

    dispose()
  })
})




test("revisiting a session whose resolution failed while unfocused retries cleanly", async () => {
  await createRoot(async (dispose) => {
    const fixture = createFixture()
    const [id, setId] = createSignal("ses_a")
    const current = createSessionResolution(id, () => fixture.sessions)

    await flush()
    setId("ses_b")
    fixture.fail("ses_a", new Error("resolve failed"))
    await flush()

    expect(() => {
      setId("ses_a")
      current()
    }).not.toThrow()
    expect(fixture.resolves).toEqual(["ses_a", "ses_b", "ses_a"])
    expect(fixture.messages.syncs).toEqual(["ses_a", "ses_b", "ses_a"])

    fixture.settle("ses_a")
    await flush()
    expect(current()?.id).toBe("ses_a")

    dispose()
  })
})




test("re-resolves against a replaced session store", async () => {
  await createRoot(async (dispose) => {
    const first = createFixture()
    const second = createFixture()
    const [store, setStore] = createSignal(first.sessions)
    const current = createSessionResolution(() => "ses_a", store)

    await flush()
    first.settle("ses_a")
    await flush()
    expect(current()?.id).toBe("ses_a")

    expect(() => {
      setStore(second.sessions)
      current()
    }).not.toThrow()
    await flush()
    expect(second.resolves).toEqual(["ses_a"])
    expect(first.messages.syncs).toEqual(["ses_a"])
    expect(second.messages.syncs).toEqual(["ses_a"])

    second.settle("ses_a")
    await flush()
    expect(current()?.id).toBe("ses_a")

    dispose()
  })
})



test("throws not found when the settled session is deleted", async () => {
  await createRoot(async (dispose) => {
    const fixture = createFixture()

    const current = createSessionResolution(
      () => "ses_a",
      () => fixture.sessions,
    )

    await flush()
    fixture.settle("ses_a")
    await flush()
    expect(current()?.id).toBe("ses_a")

    expect(() => {
      fixture.remove("ses_a")
      current()
    }).toThrow("Session not found: ses_a")

    dispose()
  })
})

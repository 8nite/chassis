import { expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import { createConnectionSync } from "@/runtime/server/server-sync/connection"


test("invalidates disconnected data and synchronizes after each handshake", () => {
  const calls: string[] = []

  const root = createRoot((dispose) => {
    const [status, setStatus] = createSignal<"connecting" | "connected" | "reconnecting">("connecting")

    const connection = createConnectionSync({
      status,
      invalidate: () => calls.push("invalidate"),
      connected: (info) => calls.push(`connected:${info.reconnect}`),
    })

    return { connection, setStatus, dispose }
  })

  try {
    expect(calls).toEqual(["invalidate"])
    root.connection.handleEvent({ type: "server.connected" })
    root.setStatus("connected")
    expect(calls).toEqual(["invalidate", "connected:false"])

    root.setStatus("reconnecting")
    root.connection.handleEvent({ type: "server.connected" })
    root.setStatus("connected")
    expect(calls).toEqual(["invalidate", "connected:false", "invalidate", "connected:true"])
  } finally {
    root.dispose()
  }
})

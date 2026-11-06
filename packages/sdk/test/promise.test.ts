import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "../../core/test/fixture/tmpdir"
import { Chassis, Session } from "../src"

test("Promise host uses the embedded router", async () => {
  await using directory = await tmpdir("chassis-promise-sdk-")
  const config = join(directory.path, "config")
  await mkdir(config)
  const chassis = await Chassis.create({
    events: { persist: true },
    config: { directory: config, project: false, content: "{}" },
  })

  try {
    const location = { directory: directory.path }
    const session = await chassis.sessions.create({ location })
    const selected = await chassis.sessions.get({ sessionID: session.id })
    const page = await chassis.sessions.list({ directory: directory.path })
    const events = Array.fromAsync(chassis.sessions.log({ sessionID: session.id }))

    expect(selected.id).toBe(session.id)
    expect(page.data.some((item) => item.id === session.id)).toBe(true)
    expect((await events).some((event) => event.type === "session.created")).toBe(true)

    const missingSessionID = Session.ID.create()
    const missing = await chassis.sessions.get({ sessionID: missingSessionID }).catch((error: unknown) => error)
    expect(missing).toMatchObject({ _tag: "SessionNotFoundError", sessionID: missingSessionID })
  } finally {
    await chassis.close()
    await chassis.close()
  }
})

test("Promise event streams support cancellation", async () => {
  await using directory = await tmpdir("chassis-promise-stream-")
  const config = join(directory.path, "config")
  await mkdir(config)
  {
    await using chassis = await Chassis.create({ config: { directory: config, project: false, content: "{}" } })
    const controller = new AbortController()
    const events = chassis.events.subscribe({ signal: controller.signal })[Symbol.asyncIterator]()
    expect(await events.next()).toMatchObject({ value: { type: "server.connected" }, done: false })
    const pending = events.next()
    controller.abort()
    const error = await pending.catch((error: unknown) => error)
    expect(error).toMatchObject({ name: "ClientError", reason: "Transport" })
    await events.return?.()
  }
})

test("closing cancels active Promise event streams", async () => {
  await using directory = await tmpdir("chassis-promise-stream-close-")
  const config = join(directory.path, "config")
  await mkdir(config)
  const chassis = await Chassis.create({ config: { directory: config, project: false, content: "{}" } })
  const events = chassis.events.subscribe()[Symbol.asyncIterator]()
  expect(await events.next()).toMatchObject({ value: { type: "server.connected" }, done: false })
  const pending = events.next()

  await chassis.close()
  const error = await pending.catch((error: unknown) => error)
  expect(error).toMatchObject({ name: "ClientError", reason: "Transport" })
})

import { expect, test } from "bun:test"
import { isChassisEvent, ChassisEvent, type ChassisEventEncoded } from "../src/groups/event.js"

type JsonShape<Value> = Value extends string | number | boolean | null
  ? Value
  : Value extends undefined
    ? never
    : Value extends ReadonlyArray<infer Item>
      ? ReadonlyArray<JsonShape<Item>>
      : Value extends object
        ? {
            readonly [Key in keyof Value as undefined extends Value[Key] ? never : Key]: JsonShape<Value[Key]>
          } & {
            readonly [Key in keyof Value as undefined extends Value[Key] ? Key : never]?: JsonShape<
              Exclude<Value[Key], undefined>
            >
          }
        : Value



const wireReady: [JsonShape<ChassisEvent>] extends [JsonShape<ChassisEventEncoded>] ? true : false = true

test("classifies public events by type", () => {
  expect(isChassisEvent({ type: "server.connected" })).toBe(true)
  expect(isChassisEvent({ type: "mcp.status.changed" })).toBe(true)
  expect(isChassisEvent({ type: "mcp.resources.changed" })).toBe(true)
  expect(isChassisEvent({ type: "mcp.tools.changed" })).toBe(false)
  expect(isChassisEvent({ type: "acme.updated" })).toBe(false)
})

test("keeps public event runtime values within the encoded contract", () => {
  expect(wireReady).toBe(true)
})


import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { CodeMode } from "../src/index.js"

const value = async (code: string) => {
  const result = await Effect.runPromise(CodeMode.execute({ code, tools: {} }))
  if (!result.ok) throw new Error(`expected success, got ${result.error.kind}: ${result.error.message}`)
  return result.value
}

describe("constructor Test262 parity", () => {
  test("test/built-ins/RegExp/S15.10.7_A3_T1.js", async () => {
    expect(
      await value(`
        const __re = /[^a]*/
        return [typeof __re, __re.constructor === RegExp, __re instanceof RegExp]
      `),
    ).toEqual(["object", true, true])
  })

  test("test/built-ins/RegExp/S15.10.7_A3_T2.js", async () => {
    expect(
      await value(`
        const __re = new RegExp()
        return [typeof __re, __re.constructor === RegExp, __re instanceof RegExp]
      `),
    ).toEqual(["object", true, true])
  })

  test("test/built-ins/Object/S15.2.2.1_A1_T1.js", async () => {
    expect(
      await value(`
        const obj = new Object()
        return [obj !== undefined, obj.constructor === Object]
      `),
    ).toEqual([true, true])
  })

  test("every built-in reports itself for its own values", async () => {
    expect(
      await value(`
        return [
          [].constructor === Array, "".constructor === String, (1).constructor === Number, true.constructor === Boolean,
          new Date(0).constructor === Date, new Map().constructor === Map, new Set().constructor === Set,
          new URL("https://a.b/").constructor === URL, new URLSearchParams("a=1").constructor === URLSearchParams,
          Promise.resolve(1).constructor === Promise, new TypeError("x").constructor === TypeError,
          new RangeError("x").constructor === RangeError, new AggregateError([]).constructor === AggregateError,
        ]
      `),
    ).toEqual(Array(13).fill(true))
  })
})

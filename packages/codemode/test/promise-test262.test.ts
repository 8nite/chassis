
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { CodeMode } from "../src/index.js"

const execute = (code: string) => Effect.runPromise(CodeMode.execute({ code, tools: {}, limits: { timeoutMs: 1_000 } }))

const value = async (code: string) => {
  const result = await execute(code)
  if (!result.ok) throw new Error(`expected success, got ${result.error.kind}: ${result.error.message}`)
  return result.value
}

describe("Test262 Promise statics", () => {
  test("statics are callable and return promises", async () => {
    
    
    
    
    
    
    
    expect(
      await value(`
        const values = [
          Promise.all([]),
          Promise.allSettled([]),
          Promise.race([undefined]),
          Promise.resolve(),
          Promise.reject(),
        ]
        const callable = [
          typeof Promise.all,
          typeof Promise.allSettled,
          typeof Promise.race,
          typeof Promise.resolve,
          typeof Promise.reject,
        ]
        try { await values[4] } catch {}
        return [callable, values.map((item) => item instanceof Promise)]
      `),
    ).toEqual([
      ["function", "function", "function", "function", "function"],
      [true, true, true, true, true],
    ])
  })

  test("Promise.all returns fresh arrays for empty and settled inputs", async () => {
    
    
    
    
    
    
    expect(
      await value(`
        const input = []
        const emptyPromise = Promise.all(input)
        const empty = await emptyPromise
        const onePromise = Promise.all([Promise.resolve(3)])
        const one = await onePromise
        return [
          emptyPromise instanceof Promise,
          empty instanceof Array,
          empty.length,
          empty !== input,
          onePromise instanceof Promise,
          one instanceof Array,
          one.length,
          one[0],
        ]
      `),
    ).toEqual([true, true, 0, true, true, true, 1, 3])
  })

  test("Promise.all adopts values and preserves input order and identity", async () => {
    
    
    
    
    const result = await value(`
      const first = { id: 1 }
      const second = { id: 2 }
      const values = await Promise.all([Promise.resolve(3), first, Promise.resolve(second)])
      const observe = async (promise) => {
        try { await promise; return "fulfilled" } catch (reason) { return reason }
      }
      return [
        values.length,
        values[0],
        values[1] === first,
        values[2] === second,
        await observe(Promise.all([Promise.reject(1), Promise.resolve(2)])),
        await observe(Promise.all([Promise.resolve(1), Promise.reject(2)])),
      ]
    `)
    expect(result).toEqual([3, 3, true, true, 1, 2])
  })

  test("Promise.allSettled returns fresh arrays and ordered outcome records", async () => {
    
    
    
    
    
    
    
    expect(
      await value(`
        const input = []
        const empty = await Promise.allSettled(input)
        const reason = { id: 4 }
        const object = { id: 5 }
        const outcomes = await Promise.allSettled([
          Promise.resolve(1),
          Promise.reject(2),
          3,
          Promise.reject(reason),
          object,
        ])
        return [
          empty instanceof Array,
          empty.length,
          empty !== input,
          outcomes,
          outcomes[4].value === object,
          outcomes.map((item) => Object.keys(item)),
        ]
      `),
    ).toEqual([
      true,
      0,
      true,
      [
        { status: "fulfilled", value: 1 },
        { status: "rejected", reason: 2 },
        { status: "fulfilled", value: 3 },
        { status: "rejected", reason: { id: 4 } },
        { status: "fulfilled", value: { id: 5 } },
      ],
      true,
      [
        ["status", "value"],
        ["status", "reason"],
        ["status", "value"],
        ["status", "reason"],
        ["status", "value"],
      ],
    ])
  })

  test("Promise.race preserves fulfillment, rejection, and iterable order", async () => {
    
    
    
    
    
    
    expect(
      await value(`
        const observe = async (promise) => {
          try { return ["fulfilled", await promise] } catch (reason) { return ["rejected", reason] }
        }
        return await Promise.all([
          observe(Promise.race([23])),
          observe(Promise.race([Promise.reject(7)])),
          observe(Promise.race([Promise.resolve(1), Promise.resolve(2)])),
          observe(Promise.race([Promise.reject(3), Promise.resolve(4)])),
        ])
      `),
    ).toEqual([
      ["fulfilled", 23],
      ["rejected", 7],
      ["fulfilled", 1],
      ["rejected", 3],
    ])
  })

  test("combinators consume supported string iterables", async () => {
    
    
    
    
    expect(
      await value(`
        return [
          await Promise.all("abc"),
          await Promise.allSettled("ab"),
          await Promise.race("abc"),
        ]
      `),
    ).toEqual([
      ["a", "b", "c"],
      [
        { status: "fulfilled", value: "a" },
        { status: "fulfilled", value: "b" },
      ],
      "a",
    ])
  })

  test("Promise.resolve adopts values and preserves CodeMode-promise identity", async () => {
    
    
    
    
    expect(
      await value(`
        const object = { id: 1 }
        const promise = Promise.resolve(1)
        return [
          await Promise.resolve(23),
          await Promise.resolve(Promise.resolve(24)),
          (await Promise.resolve(object)) === object,
          [promise].includes(Promise.resolve(promise)),
        ]
      `),
    ).toEqual([23, 24, true, true])
  })

  test("Promise.reject preserves primitive and object reasons", async () => {
    
    
    const result = await value(`
      const object = { reason: true }
      const reasons = [undefined, null, false, true, 0, "", 42, object]
      const observe = async (reason) => {
        try { await Promise.reject(reason); return false } catch (caught) { return caught === reason }
      }
      return await Promise.all(reasons.map(observe))
    `)
    expect(result).toEqual([true, true, true, true, true, true, true, true])
  })

  test("Promise.all resolves duplicate members into every slot", async () => {
    
    
    
    
    
    expect(
      await value(`
        const settled = Promise.resolve(3)
        const computed = (async () => "computed")()
        return [
          await Promise.all([settled, settled, settled]),
          await Promise.all([computed, "plain", computed]),
        ]
      `),
    ).toEqual([
      [3, 3, 3],
      ["computed", "plain", "computed"],
    ])
  })

  test("Promise.allSettled records duplicate members independently", async () => {
    
    
    
    expect(
      await value(`
        const good = Promise.resolve(1)
        const bad = Promise.reject(2)
        return await Promise.allSettled([good, bad, good, bad])
      `),
    ).toEqual([
      { status: "fulfilled", value: 1 },
      { status: "rejected", reason: 2 },
      { status: "fulfilled", value: 1 },
      { status: "rejected", reason: 2 },
    ])
  })

  test("combinators adopt members that settled before the call", async () => {
    
    
    
    
    
    
    expect(
      await value(`
        const fulfilled = Promise.resolve("done")
        const rejected = Promise.reject("failed")
        try { await rejected } catch {}
        const observe = async (promise) => {
          try { return ["fulfilled", await promise] } catch (reason) { return ["rejected", reason] }
        }
        return [
          await observe(Promise.all([fulfilled, rejected])),
          await Promise.allSettled([rejected, fulfilled]),
          await observe(Promise.race([rejected, fulfilled])),
        ]
      `),
    ).toEqual([
      ["rejected", "failed"],
      [
        { status: "rejected", reason: "failed" },
        { status: "fulfilled", value: "done" },
      ],
      ["rejected", "failed"],
    ])
  })

  test("combinator results follow input order, not settlement order", async () => {
    
    
    
    
    
    expect(
      await value(`
        const third = Promise.resolve("c")
        const failing = (async () => { throw "b" })()
        try { await failing } catch {}
        const second = (async () => "b")()
        const first = Promise.resolve("a")
        return [
          await Promise.all([first, second, third]),
          await Promise.allSettled([first, failing, third]),
        ]
      `),
    ).toEqual([
      ["a", "b", "c"],
      [
        { status: "fulfilled", value: "a" },
        { status: "rejected", reason: "b" },
        { status: "fulfilled", value: "c" },
      ],
    ])
  })

  test("Promise.race ignores a rejected loser once the first contender wins", async () => {
    
    
    
    expect(
      await execute(`
        const loser = (async () => { throw "lost" })()
        return await Promise.race([Promise.resolve("won"), loser])
      `),
    ).toEqual({ ok: true, value: "won", toolCalls: [] })
  })

  test("Promise.race([]) returns a promise whose CodeMode failure is catchable", async () => {
    
    
    
    
    
    
    expect(
      await value(`
        const empty = Promise.race([])
        try {
          await empty
          return "settled"
        } catch (error) {
          return [empty instanceof Promise, error instanceof Error]
        }
      `),
    ).toEqual([true, true])
  })

  test("Promise.resolve passes the same CodeMode promise through nested chains", async () => {
    
    
    
    expect(
      await value(`
        const promise = Promise.resolve({ id: 1 })
        return [
          [promise].includes(Promise.resolve(promise)),
          [promise].includes(Promise.resolve(Promise.resolve(promise))),
          (await Promise.resolve(Promise.resolve(promise))).id,
        ]
      `),
    ).toEqual([true, true, 1])
  })

  test("Promise.resolve of a rejected promise preserves identity and reason", async () => {
    
    
    expect(
      await value(`
        const rejected = Promise.reject("oops")
        const adopted = Promise.resolve(rejected)
        const identity = [rejected].includes(adopted)
        try {
          await adopted
          return "fulfilled"
        } catch (reason) {
          return [identity, reason]
        }
      `),
    ).toEqual([true, "oops"])
  })

  test("Promise.reject uses a promise reason without flattening it", async () => {
    
    
    
    
    expect(
      await value(`
        const observe = async (reason) => {
          try {
            await Promise.reject(reason)
            return "fulfilled"
          } catch (caught) {
            const identity = [reason].includes(caught)
            try { return [identity, caught instanceof Promise, await caught] }
            catch (inner) { return [identity, caught instanceof Promise, "rethrew " + inner] }
          }
        }
        return [await observe(Promise.resolve(1)), await observe(Promise.reject("inner"))]
      `),
    ).toEqual([
      [true, true, 1],
      [true, true, "rethrew inner"],
    ])
  })
})

describe("Test262 async functions and await", () => {
  test("declaration, expression, and arrow forms return promises", async () => {
    
    
    
    
    expect(
      await value(`
        async function declaration() { return 1 }
        const expression = async function() { return 2 }
        const arrow = async () => 3
        const promises = [declaration(), expression(), arrow()]
        return [promises.map((item) => item instanceof Promise), await Promise.all(promises)]
      `),
    ).toEqual([
      [true, true, true],
      [1, 2, 3],
    ])
  })

  test("async bodies adopt returns and reject throws before and after await", async () => {
    
    
    
    
    
    
    expect(
      await value(`
        const order = []
        const plain = async () => { order.push("body"); return 42 }
        const afterAwait = async () => { await Promise.resolve(); return 43 }
        const throwsBefore = async () => { throw 1 }
        const throwsAfter = async () => { await Promise.resolve(); throw 2 }
        const observe = async (promise) => {
          try { return ["fulfilled", await promise] } catch (reason) { return ["rejected", reason] }
        }
        const first = plain()
        return [
          order,
          await observe(first),
          await observe(afterAwait()),
          await observe(throwsBefore()),
          await observe(throwsAfter()),
        ]
      `),
    ).toEqual([["body"], ["fulfilled", 42], ["fulfilled", 43], ["rejected", 1], ["rejected", 2]])
  })

  test("default-parameter throws reject instead of escaping the call", async () => {
    
    expect(
      await value(`
        const fail = () => { throw new Error("default") }
        const run = async (value = fail()) => value
        let returned = false
        try {
          const promise = run()
          returned = promise instanceof Promise
          await promise
          return [returned, "fulfilled"]
        } catch (error) {
          return [returned, error.message]
        }
      `),
    ).toEqual([true, "default"])
  })

  test("async try/finally completion records override earlier completion", async () => {
    
    
    
    expect(
      await value(`
        const observe = async (promise) => {
          try { return ["fulfilled", await promise] } catch (reason) { return ["rejected", reason] }
        }
        const returnReturn = async () => { try { return "early" } finally { return await Promise.resolve("override") } }
        const returnThrow = async () => { try { return "early" } finally { throw "override" } }
        const returnReject = async () => { try { return "early" } finally { await Promise.reject("override") } }
        const throwReturn = async () => { try { throw "early" } finally { return await Promise.resolve("override") } }
        const throwThrow = async () => { try { throw "early" } finally { throw "override" } }
        const throwReject = async () => { try { throw "early" } finally { await Promise.reject("override") } }
        const rejectReturn = async () => { try { await Promise.reject("early") } finally { return await Promise.resolve("override") } }
        const rejectThrow = async () => { try { await Promise.reject("early") } finally { throw "override" } }
        const rejectReject = async () => { try { await Promise.reject("early") } finally { await Promise.reject("override") } }
        return await Promise.all([
          observe(returnReturn()), observe(returnThrow()), observe(returnReject()),
          observe(throwReturn()), observe(throwThrow()), observe(throwReject()),
          observe(rejectReturn()), observe(rejectThrow()), observe(rejectReject()),
        ])
      `),
    ).toEqual([
      ["fulfilled", "override"],
      ["rejected", "override"],
      ["rejected", "override"],
      ["fulfilled", "override"],
      ["rejected", "override"],
      ["rejected", "override"],
      ["fulfilled", "override"],
      ["rejected", "override"],
      ["rejected", "override"],
    ])
  })

  test("await preserves an object whose then property is not callable", async () => {
    
    expect(
      await value(`
        const thenable = { then: 42 }
        return (await thenable) === thenable
      `),
    ).toBe(true)
  })

  test("await returns non-promise operands unchanged", async () => {
    
    
    
    expect(
      await value(`
        const object = { id: 1 }
        const array = [1, 2]
        return [
          await 1,
          await "text",
          await true,
          (await null) === null,
          (await undefined) === undefined,
          (await object) === object,
          (await array) === array,
        ]
      `),
    ).toEqual([1, "text", true, true, true, true, true])
  })
})

describe("Test262 expected Promise conformance", () => {
  for (const name of ["all", "allSettled", "race", "any"] as const) {
    test(`Promise.${name} rejects invalid input with TypeError`, async () => {
      
      
      
      
      
      
      expect(
        await value(`
          try {
            const promise = Promise.${name}(42)
            const returned = promise instanceof Promise
            await promise
            return [returned, "fulfilled"]
          } catch (error) {
            return [true, error.name]
          }
        `),
      ).toEqual([true, "TypeError"])
    })
  }

  test("Promise.all consumes sparse positions as undefined", async () => {
    
    expect(
      await value(`
        const input = []
        input[1] = 1
        const result = await Promise.all(input)
        return [result.length, result[0] === undefined, result[1]]
      `),
    ).toEqual([2, true, 1])
  })

  test("Promise.allSettled consumes sparse positions as undefined", async () => {
    
    expect(
      await value(`
        const input = []
        input[1] = 1
        const result = await Promise.allSettled(input)
        return [result.length, result[0].status, result[0].value === undefined, result[1]]
      `),
    ).toEqual([2, "fulfilled", true, { status: "fulfilled", value: 1 }])
  })

  test("Promise.race consumes a sparse first position as undefined", async () => {
    
    expect(
      await value(`
        const input = []
        input[1] = 1
        return (await Promise.race(input)) === undefined
      `),
    ).toBe(true)
  })

  test("Promise.any consumes a sparse first position as an undefined fulfillment", async () => {
    
    expect(
      await value(`
        const input = []
        input[1] = Promise.reject("loses")
        return (await Promise.any(input)) === undefined
      `),
    ).toBe(true)
  })

  test("Promise.all settles after reactions attached to its inputs", async () => {
    
    
    
    expect(
      await value(`
        const sequence = [1]
        const input = Promise.resolve(1)
        const aggregate = Promise.all([input])
        aggregate.then(() => sequence.push(4))
        input.then(() => sequence.push(3)).then(() => sequence.push(5))
        sequence.push(2)
        await aggregate
        await Promise.resolve()
        return sequence
      `),
    ).toEqual([1, 2, 3, 4, 5])
  })

  test("Promise.allSettled settles after reactions attached to its inputs", async () => {
    
    
    
    
    
    expect(
      await value(`
        const sequence = [1]
        const input = Promise.resolve(1)
        const aggregate = Promise.allSettled([input])
        aggregate.then(() => sequence.push(4))
        input.then(() => sequence.push(3)).then(() => sequence.push(5))
        sequence.push(2)
        await aggregate
        await Promise.resolve()
        return sequence
      `),
    ).toEqual([1, 2, 3, 4, 5])
  })

  test("Promise.race settles in a reaction after its winning input", async () => {
    
    
    
    expect(
      await value(`
        const sequence = [1]
        const race = Promise.race([1])
        race.then(() => sequence.push(4))
        Promise.resolve().then(() => sequence.push(3)).then(() => sequence.push(5))
        sequence.push(2)
        await race
        await Promise.resolve()
        return sequence
      `),
    ).toEqual([1, 2, 3, 4, 5])
  })

  test("then reactions route and propagate fulfillment and rejection", async () => {
    
    
    
    
    
    
    
    
    
    expect(
      await value(`
        const observe = async (promise) => {
          try { return ["fulfilled", await promise] } catch (reason) { return ["rejected", reason] }
        }
        return await Promise.all([
          observe(Promise.resolve(1).then((value) => value + 1)),
          observe(Promise.reject(2).then(undefined, (reason) => reason + 1)),
          observe(Promise.resolve(3).then(undefined)),
          observe(Promise.reject(4).then(undefined)),
          observe(Promise.resolve(5).then(() => { throw 6 })),
          observe(Promise.reject(7).then(undefined, () => { throw 8 })),
        ])
      `),
    ).toEqual([
      ["fulfilled", 2],
      ["fulfilled", 3],
      ["fulfilled", 3],
      ["rejected", 4],
      ["rejected", 6],
      ["rejected", 8],
    ])
  })

  test("then reactions preserve breadth-first queue order", async () => {
    
    expect(
      await value(`
        const sequence = [1]
        const promise = Promise.resolve()
        const first = promise.then(() => sequence.push(3)).then(() => sequence.push(5)).then(() => sequence.push(7))
        const second = promise.then(() => sequence.push(4)).then(() => sequence.push(6)).then(() => sequence.push(8))
        sequence.push(2)
        await Promise.all([first, second])
        return sequence
      `),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  test("then rejects direct self-resolution for fulfilled and rejected sources", async () => {
    
    
    
    
    
    expect(
      await value(`
        const observe = async (promise) => {
          try { await promise; return "fulfilled" } catch (reason) { return reason.name }
        }
        let fulfilled
        let rejected
        fulfilled = Promise.resolve().then(() => fulfilled)
        rejected = Promise.reject().then(undefined, () => rejected)
        return await Promise.all([observe(fulfilled), observe(rejected)])
      `),
    ).toEqual(["TypeError", "TypeError"])
  })

  test("catch delegates rejection handling and preserves fulfillment", async () => {
    
    
    
    
    expect(
      await value(`
        return [
          await Promise.resolve(1).catch(() => 2),
          await Promise.reject(3).catch((reason) => reason + 1),
        ]
      `),
    ).toEqual([1, 4])
  })

  test("finally preserves or replaces the original settlement", async () => {
    
    
    
    
    expect(
      await value(`
        const observe = async (promise) => {
          try { return ["fulfilled", await promise] } catch (reason) { return ["rejected", reason] }
        }
        return await Promise.all([
          observe(Promise.resolve(1).finally(() => 2)),
          observe(Promise.reject(3).finally(() => 4)),
          observe(Promise.reject(5).finally(() => { throw 6 })),
        ])
      `),
    ).toEqual([
      ["fulfilled", 1],
      ["rejected", 3],
      ["rejected", 6],
    ])
  })

  test("then ignores non-callable handlers", async () => {
    
    
    
    
    
    
    
    expect(
      await value(`
        const observe = async (promise) => {
          try { return ["fulfilled", await promise] } catch (reason) { return ["rejected", reason] }
        }
        return await Promise.all([
          observe(Promise.resolve(1).then(2)),
          observe(Promise.resolve(4).then(null, null)),
          observe(Promise.resolve(5).then({}, "x")),
          observe(Promise.reject(3).then(null, "x")),
          observe(Promise.reject(6).then(7, {})),
        ])
      `),
    ).toEqual([
      ["fulfilled", 1],
      ["fulfilled", 4],
      ["fulfilled", 5],
      ["rejected", 3],
      ["rejected", 6],
    ])
  })

  test("finally waits for a returned promise and preserves or replaces settlement", async () => {
    
    
    
    
    expect(
      await value(`
        const observe = async (promise) => {
          try { return ["fulfilled", await promise] } catch (reason) { return ["rejected", reason] }
        }
        const order = []
        const cleanup = async () => {
          await Promise.resolve()
          order.push("cleanup")
        }
        const settled = await Promise.resolve("kept").finally(() => cleanup())
        order.push("settled:" + settled)
        return [
          await observe(Promise.resolve(1).finally(() => Promise.resolve(99))),
          order,
          await observe(Promise.resolve(2).finally(() => Promise.reject(3))),
          await observe(Promise.reject(4).finally(() => Promise.resolve(99))),
        ]
      `),
    ).toEqual([
      ["fulfilled", 1],
      ["cleanup", "settled:kept"],
      ["rejected", 3],
      ["rejected", 4],
    ])
  })

  test("then adopts a returned rejected promise", async () => {
    
    
    
    
    
    expect(
      await value(`
        const observe = async (promise) => {
          try { return ["fulfilled", await promise] } catch (reason) { return ["rejected", reason] }
        }
        return await Promise.all([
          observe(Promise.resolve(1).then(() => Promise.reject("bad"))),
          observe(Promise.reject(2).then(undefined, () => Promise.resolve("ok"))),
        ])
      `),
    ).toEqual([
      ["rejected", "bad"],
      ["fulfilled", "ok"],
    ])
  })

  test("independent reactions on one source each observe the same settlement", async () => {
    
    
    
    expect(
      await value(`
        const fulfilled = Promise.resolve(7)
        const rejected = Promise.reject(8)
        return await Promise.all([
          fulfilled.then((value) => "first:" + value),
          fulfilled.then((value) => "second:" + value),
          rejected.catch((reason) => "first:" + reason),
          rejected.catch((reason) => "second:" + reason),
        ])
      `),
    ).toEqual(["first:7", "second:7", "first:8", "second:8"])
  })

  test("await always resumes in a later reaction and interleaves async functions", async () => {
    
    
    
    expect(
      await value(`
        const sequence = []
        const first = async () => { sequence.push("first:1"); await 0; sequence.push("first:2") }
        const second = async () => { sequence.push("second:1"); await 0; sequence.push("second:2") }
        await Promise.all([first(), second()])
        return sequence
      `),
    ).toEqual(["first:1", "second:1", "first:2", "second:2"])
  })

  test("an async function rejects when it resolves with its own promise", async () => {
    
    
    
    expect(
      await value(`
        let promise
        const run = async () => {
          await Promise.resolve()
          return promise
        }
        promise = run()
        try {
          await promise
          return "fulfilled"
        } catch (error) {
          return error.name
        }
      `),
    ).toBe("TypeError")
  })

  test("Promise.resolve recursively assimilates callable thenables", async () => {
    
    expect(
      await value(`
        const value = { id: 1 }
        const nested = { then: (resolve) => resolve(value) }
        const thenable = { then: (resolve) => resolve(nested) }
        return (await Promise.resolve(thenable)) === value
      `),
    ).toBe(true)
  })

  test("Promise combinators assimilate callable thenable inputs", async () => {
    
    
    
    
    
    expect(
      await value(`
        const fulfills = { then: (resolve) => resolve(1) }
        const rejects = { then: (_, reject) => reject(2) }
        const resolvesFirst = { then: (resolve, reject) => { resolve(3); reject(4) } }
        const observe = async (promise) => {
          try { return ["fulfilled", await promise] } catch (reason) { return ["rejected", reason] }
        }
        return [
          await observe(Promise.all([fulfills, rejects])),
          await Promise.allSettled([fulfills, resolvesFirst]),
          await observe(Promise.race([rejects])),
        ]
      `),
    ).toEqual([
      ["rejected", 2],
      [
        { status: "fulfilled", value: 1 },
        { status: "fulfilled", value: 3 },
      ],
      ["rejected", 2],
    ])
  })

  test("await assimilates callable thenables", async () => {
    
    expect(
      await value(`
        const thenable = { then: (resolve) => resolve(42) }
        return await thenable
      `),
    ).toBe(42)
  })

  test("await rejects when a callable thenable throws", async () => {
    
    expect(
      await value(`
        const error = { id: 1 }
        const thenable = { then: () => { throw error } }
        try {
          await thenable
          return false
        } catch (caught) {
          return caught === error
        }
      `),
    ).toBe(true)
  })

  test("thenable resolution is deferred and settles only once", async () => {
    
    
    
    expect(
      await value(`
        const sequence = []
        const thenable = {
          then: (resolve, reject) => {
            sequence.push("then")
            resolve(1)
            reject(2)
            throw 3
          }
        }
        const promise = Promise.resolve(thenable)
        sequence.push("after resolve")
        const result = await promise
        sequence.push("after await")
        return [result, sequence]
      `),
    ).toEqual([1, ["after resolve", "then", "after await"]])
  })

  test("the first thenable rejection wins over later resolution and throws", async () => {
    
    expect(
      await value(`
        const thenable = {
          then: (resolve, reject) => {
            reject("first")
            resolve("second")
            throw "third"
          }
        }
        try {
          await thenable
          return "fulfilled"
        } catch (reason) {
          return reason
        }
      `),
    ).toBe("first")
  })

  test("constructors, reactions, finally, and async returns assimilate thenables", async () => {
    
    
    
    
    const thenable = (value: string) => `({ then: (resolve) => resolve(${JSON.stringify(value)}) })`
    expect(
      await value(`
        const fromAsync = async () => ${thenable("async")}
        const cleanup = []
        return await Promise.all([
          new Promise((resolve) => resolve(${thenable("constructor")})),
          Promise.resolve().then(() => ${thenable("reaction")}),
          Promise.resolve("kept").finally(() => {
            cleanup.push("ran")
            return ${thenable("ignored")}
          }),
          fromAsync(),
        ]).then((values) => [values, cleanup])
      `),
    ).toEqual([["constructor", "reaction", "kept", "async"], ["ran"]])
  })

  test("finally settles after its cleanup thenable reactions", async () => {
    
    expect(
      await value(`
        const sequence = []
        const cleanup = { then: (resolve) => { sequence.push("then"); resolve() } }
        const result = Promise.resolve("kept").finally(() => cleanup)
        result.then(() => sequence.push("finally"))
        Promise.resolve()
          .then(() => sequence.push("tick1"))
          .then(() => sequence.push("tick2"))
          .then(() => sequence.push("tick3"))
          .then(() => sequence.push("tick4"))
        await result
        sequence.push("await")
        return sequence
      `),
    ).toEqual(["tick1", "then", "tick2", "tick3", "tick4", "finally", "await"])
  })
})

describe("Test262 Promise.any", () => {
  test("is a callable static that returns a promise", async () => {
    
    
    
    expect(
      await value(`
        const promise = Promise.any([1])
        return [typeof Promise.any, promise instanceof Promise, await promise]
      `),
    ).toEqual(["function", true, 1])
  })

  test("fulfills with the first fulfilled member, ignoring rejections", async () => {
    
    
    
    
    expect(
      await value(`
        return [
          await Promise.any([Promise.reject("a"), Promise.resolve(1), Promise.resolve(2)]),
          await Promise.any([Promise.reject("a"), "plain", Promise.reject("b")]),
        ]
      `),
    ).toEqual([1, "plain"])
  })

  test("a fulfillment wins over a later rejection of another member", async () => {
    
    
    
    expect(
      await value(`
        let rejectLate
        const late = new Promise((_, reject) => { rejectLate = reject })
        const result = await Promise.any([late, Promise.resolve("won")])
        rejectLate("too late")
        return result
      `),
    ).toBe("won")
  })

  test("rejects with an AggregateError carrying the reasons in input order", async () => {
    
    
    
    
    expect(
      await value(`
        let rejectLate
        const late = new Promise((_, reject) => { rejectLate = reject })
        const aggregate = Promise.any([Promise.reject("first"), late, Promise.reject("third")])
        rejectLate("second")
        try {
          await aggregate
          return "fulfilled"
        } catch (error) {
          return {
            isAggregate: error instanceof AggregateError,
            isError: error instanceof Error,
            name: error.name,
            message: error.message,
            errors: error.errors,
          }
        }
      `),
    ).toEqual({
      isAggregate: true,
      isError: true,
      name: "AggregateError",
      message: "All promises were rejected",
      errors: ["first", "second", "third"],
    })
  })

  test("rejects an empty input with an empty AggregateError", async () => {
    
    expect(
      await value(`
        try {
          await Promise.any([])
          return "fulfilled"
        } catch (error) {
          return [error instanceof AggregateError, error.errors.length]
        }
      `),
    ).toEqual([true, 0])
  })

  test("consumes a string input as its characters", async () => {
    
    expect(await value(`return await Promise.any("abc")`)).toBe("a")
  })

  test("rejects an empty string input with an empty AggregateError", async () => {
    
    expect(
      await value(`
        try {
          await Promise.any("")
          return "fulfilled"
        } catch (error) {
          return [error instanceof AggregateError, error.errors.length]
        }
      `),
    ).toEqual([true, 0])
  })

  test("fulfills with the first member that does not reject", async () => {
    
    
    
    expect(
      await value(`
        return await Promise.any([
          Promise.reject("a"),
          new Promise((resolve, reject) => reject("b")),
          Promise.all([Promise.reject("c")]),
          Promise.resolve(Promise.reject("d").catch((reason) => reason)),
        ])
      `),
    ).toBe("d")
  })

  test("settles after reactions attached to its inputs", async () => {
    
    expect(
      await value(`
        const sequence = [1]
        const input = Promise.resolve(1)
        const aggregate = Promise.any([input])
        aggregate.then(() => sequence.push(4))
        input.then(() => sequence.push(3)).then(() => sequence.push(5))
        sequence.push(2)
        await aggregate
        await Promise.resolve()
        return sequence
      `),
    ).toEqual([1, 2, 3, 4, 5])
  })
})

describe("Test262 AggregateError", () => {
  test("constructs from an errors collection and an optional message", async () => {
    
    
    
    expect(
      await value(`
        const input = ["x", "y"]
        const withMessage = new AggregateError(input, "msg")
        const bare = new AggregateError([])
        return [
          withMessage.name,
          withMessage.message,
          withMessage.errors,
          withMessage.errors !== input,
          withMessage instanceof AggregateError,
          withMessage instanceof Error,
          bare.message,
          bare.errors,
        ]
      `),
    ).toEqual(["AggregateError", "msg", ["x", "y"], true, true, true, "", []])
  })

  test("rejects a non-collection errors argument with TypeError", async () => {
    
    expect(
      await value(`
        try {
          new AggregateError(42)
          return "constructed"
        } catch (error) {
          return error.name
        }
      `),
    ).toBe("TypeError")
  })

  test("is callable without new", async () => {
    
    expect(
      await value(`
        const error = AggregateError(["x"], "m")
        return [error instanceof AggregateError, error instanceof Error, error.name, error.message, error.errors]
      `),
    ).toEqual([true, true, "AggregateError", "m", ["x"]])
  })

  test("coerces a non-string message to a string", async () => {
    
    
    expect(
      await value(`
        return [
          new AggregateError([], 42).message,
          new AggregateError([], false).message,
          new AggregateError([], true).message,
          new AggregateError([], null).message,
        ]
      `),
    ).toEqual(["42", "false", "true", "null"])
  })
})

describe("Test262 Promise constructor", () => {
  test("constructs a promise, handing the executor callable resolve/reject", async () => {
    
    
    
    expect(
      await value(`
        let observed
        const promise = new Promise((resolve, reject) => {
          observed = [typeof resolve, typeof reject]
          resolve("done")
        })
        return [promise instanceof Promise, observed, await promise]
      `),
    ).toEqual([true, ["function", "function"], "done"])
  })

  test("a missing or non-callable executor is a TypeError", async () => {
    
    expect(
      await value(`
        const outcomes = []
        for (const make of [() => new Promise(), () => new Promise(1), () => new Promise({})]) {
          try {
            make()
            outcomes.push("constructed")
          } catch (error) {
            outcomes.push(error.name)
          }
        }
        return outcomes
      `),
    ).toEqual(["TypeError", "TypeError", "TypeError"])
  })

  test("resolves immediately or later through an escaping resolver", async () => {
    
    
    
    
    expect(
      await value(`
        let settle
        const deferred = new Promise((resolve) => { settle = resolve })
        const immediate = new Promise((resolve) => resolve("now"))
        settle("later")
        return [await immediate, await deferred]
      `),
    ).toEqual(["now", "later"])
  })

  test("rejects through reject and through an abrupt executor completion", async () => {
    
    
    
    expect(
      await value(`
        const observe = async (promise) => {
          try { return ["fulfilled", await promise] } catch (reason) { return ["rejected", reason.message ?? reason] }
        }
        return [
          await observe(new Promise((_, reject) => reject("nope"))),
          await observe(new Promise(() => { throw new Error("boom") })),
        ]
      `),
    ).toEqual([
      ["rejected", "nope"],
      ["rejected", "boom"],
    ])
  })

  test("only the first settlement counts", async () => {
    
    
    
    expect(
      await value(`
        return [
          await new Promise((resolve, reject) => { resolve("first"); reject("second"); resolve("third") }),
          await new Promise((resolve) => { resolve(resolve("inner") === undefined ? "unreached" : "also unreached") }),
        ]
      `),
    ).toEqual(["first", "inner"])
  })

  test("escaped resolvers keep first-settle-wins in both directions", async () => {
    
    
    
    expect(
      await value(`
        let resolveRejected, rejectRejected
        const rejected = new Promise((resolve, reject) => { resolveRejected = resolve; rejectRejected = reject })
        rejectRejected("first")
        const lateResolve = resolveRejected("late")
        let resolveFulfilled, rejectFulfilled
        const fulfilled = new Promise((resolve, reject) => { resolveFulfilled = resolve; rejectFulfilled = reject })
        resolveFulfilled()
        const lateReject = rejectFulfilled(new Promise(() => {}))
        try {
          await rejected
          return "fulfilled"
        } catch (reason) {
          return [reason, lateResolve === undefined, (await fulfilled) === undefined, lateReject === undefined]
        }
      `),
    ).toEqual(["first", true, true, true])
  })

  test("a queued reaction chain observes a later rejection through a handler-less then", async () => {
    
    
    
    
    expect(
      await value(`
        const observe = (promise) => promise.then(() => "wrong").then(() => "also wrong", (reason) => "caught:" + reason)
        let reject
        const deferred = new Promise((_, r) => { reject = r })
        const chained = observe(deferred)
        reject("boom")
        return [
          await observe(new Promise((_, r) => r("immed"))),
          await chained,
          await observe(new Promise(() => { throw "abrupt" })),
        ]
      `),
    ).toEqual(["caught:immed", "caught:boom", "caught:abrupt"])
  })

  test("an exception after resolve is ignored", async () => {
    
    expect(await value(`return await new Promise((resolve) => { resolve("kept"); throw new Error("dropped") })`)).toBe(
      "kept",
    )
  })

  test("resolving with a promise adopts its settlement", async () => {
    
    
    
    expect(
      await value(`
        const adoptedValue = await new Promise((resolve) => resolve(Promise.resolve("adopted")))
        try {
          await new Promise((resolve) => resolve(Promise.reject("bad")))
          return [adoptedValue, "fulfilled"]
        } catch (reason) {
          return [adoptedValue, reason]
        }
      `),
    ).toEqual(["adopted", "bad"])
  })

  test("resolving with the promise itself rejects with TypeError", async () => {
    
    expect(
      await value(`
        let settle
        const promise = new Promise((resolve) => { settle = resolve })
        settle(promise)
        try {
          await promise
          return "fulfilled"
        } catch (error) {
          return error.name
        }
      `),
    ).toBe("TypeError")
  })

  test("executor runs synchronously before the constructor returns", async () => {
    
    expect(
      await value(`
        const sequence = []
        sequence.push("before")
        new Promise((resolve) => { sequence.push("executor"); resolve() })
        sequence.push("after")
        return sequence
      `),
    ).toEqual(["before", "executor", "after"])
  })

  test("calling Promise without new throws TypeError", async () => {
    
    expect(
      await value(`
        try {
          Promise(() => {})
          return "called"
        } catch (error) {
          return error.name
        }
      `),
    ).toBe("TypeError")
  })
})

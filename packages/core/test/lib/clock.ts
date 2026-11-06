import { Effect } from "effect"
import { TestClock } from "effect/testing"



const settle = Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 1)))


const tick = Effect.gen(function* () {
  yield* settle
  yield* TestClock.adjust("500 millis")
})


export const advance = Effect.fnUntraced(function* (condition: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (condition()) return
    yield* tick
  }
  return yield* Effect.die(new Error("condition never became true after 100 advances"))
})


export const drain = Effect.gen(function* () {
  for (let round = 0; round < 4; round++) {
    yield* tick
  }
  yield* settle
})

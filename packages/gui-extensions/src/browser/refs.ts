import type { Persisted } from "../sdk/main"


const block = 10_000


export function createRefs(reserved: Persisted<number, number>) {
  const state = { next: reserved.value, end: reserved.value }

  return () => {
    if (state.next >= state.end) {
      state.end = state.next + block
      reserved.set(state.end)
    }

    return `e${++state.next}`
  }
}

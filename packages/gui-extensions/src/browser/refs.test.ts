import { expect, test } from "bun:test"
import { Schema } from "effect"
import browser from "./index"
import { createRefs } from "./refs"


type Disk = { stored?: number }

test("element refs stay unique when the pane's main entry reloads over the same storage", () => {
  const values: Disk = {}
  const declared = browser.stores.refs

  
  const open = () => {
    const read = () =>
      "stored" in values ? Schema.decodeUnknownSync(declared.schema)(values.stored) : declared.initial

    return {
      get value() {
        return read()
      },
      ready: () => true,
      update: (mutate: (draft: number) => void) => mutate(read()),
      set: (next: number) => void (values.stored = Schema.encodeUnknownSync(declared.schema)(next)),
    }
  }

  const before = createRefs(open())
  const issued = [before(), before()]
  const after = createRefs(open())
  expect(issued).toEqual(["e1", "e2"])
  expect(issued).not.toContain(after())
})

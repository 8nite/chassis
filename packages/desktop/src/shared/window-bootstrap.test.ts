import { describe, expect, test } from "bun:test"
import { windowBootstrapArgument, windowBootstrapFromArguments } from "./window-bootstrap"

describe("window bootstrap", () => {
  test("round-trips through argv and keeps unknown values absent", () => {
    const bootstrap = { id: "win a/b ü", firstLaunchPending: false, packaged: true }
    expect(windowBootstrapFromArguments(["electron", windowBootstrapArgument(bootstrap)])).toEqual(bootstrap)
    
    expect(windowBootstrapFromArguments([windowBootstrapArgument({ id: "x" })])).toEqual({ id: "x" })
    expect(() => windowBootstrapFromArguments(["electron"])).toThrow("Window bootstrap argument not found")
  })
})

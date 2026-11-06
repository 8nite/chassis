import { beforeEach, describe, expect, test } from "bun:test"
import { createSignal, type JSX } from "solid-js"
import { showToast, toaster } from "@chassis/ui/toast"

describe("showToast", () => {
  
  beforeEach(() => {
    toaster.dismiss()
  })

  test("coalesces exact active content", () => {
    const first = showToast({ title: "Repeated error", description: "Try again" })
    const second = showToast({ title: "Repeated error", description: "Try again" })
    const different = showToast({ title: "Repeated error", description: "A different error" })

    expect(second).toBe(first)
    expect(different).not.toBe(first)

    toaster.dismiss(first)
    toaster.dismiss(different)
  })

  test("allows dismissed content to appear again", () => {
    const first = showToast("Dismiss and retry")
    toaster.dismiss(first)

    const second = showToast("Dismiss and retry")
    expect(second).not.toBe(first)

    toaster.dismiss(second)
  })

  test("recreates matching content when it is not the topmost toast", () => {
    const first = showToast("First toast")
    const topmost = showToast("Topmost toast")
    const repeated = showToast("First toast")

    expect(repeated).not.toBe(first)

    toaster.dismiss(topmost)
    toaster.dismiss(repeated)
  })

  test("creates no reactive computations at call time", () => {
    const [tick, setTick] = createSignal(0)
    let reads = 0

    const icon = (() => {
      reads++
      tick()

      return undefined
    }) as unknown as JSX.Element

    const id = showToast({ description: "test", icon })

    
    
    
    expect(reads).toBe(0)
    setTick(1)
    expect(reads).toBe(0)

    toaster.dismiss(id)
  })
})

import { WorkerPoolManager } from "@pierre/diffs/worker"
import ShikiWorkerUrl from "@pierre/diffs/worker/worker.js?worker&url"
import { registerChassisTheme } from "@chassis/ui/context/marked-theme-register"

registerChassisTheme()

export function workerFactory(): Worker {
  return new Worker(ShikiWorkerUrl, { type: "module" })
}

function createPool(lineDiffType: "none" | "word-line") {
  const pool = new WorkerPoolManager(
    {
      workerFactory,
      
      
      
      
      
      poolSize: 2,
    },
    {
      theme: "Chassis",
      lineDiffType,
      
      
      ...(lineDiffType === "none" && { maxLineDiffLength: 0, tokenizeMaxLineLength: 1 }),
      preferredHighlighter: "shiki-wasm",
    },
  )

  void pool.initialize()

  return pool
}

let plain: WorkerPoolManager | undefined

let diff: WorkerPoolManager | undefined

export function getWorkerPool(lineDiffType: "none" | "word-line" = "word-line"): WorkerPoolManager | undefined {
  if (typeof window === "undefined") return

  if (lineDiffType === "none") {
    if (!plain) plain = createPool("none")

    return plain
  }

  if (!diff) diff = createPool("word-line")

  return diff
}

export function getWorkerPools() {
  const pool = getWorkerPool()

  return {
    unified: pool,
    split: pool,
  }
}

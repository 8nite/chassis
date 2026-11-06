import { serveWorker, Transfer, type Method } from "./worker-rpc"




export type FixtureMethods = {
  readonly echo: Method<string, string>
  readonly sleep: Method<number, undefined>
  
  readonly spin: Method<number, ArrayBuffer>
  
  readonly hold: Method<undefined, undefined>
  
  readonly paint: Method<number, ImageBitmap>
  readonly log: Method<
    undefined,
    { readonly ran: readonly string[]; readonly aborted: readonly string[]; readonly closed: number }
  >
}

type Log = { ran: string[]; aborted: string[]; closed: number }

const log: Log = { ran: [], aborted: [], closed: 0 }


class StandInBitmap {
  close() {
    log.closed += 1
  }
}

Object.assign(globalThis, { ImageBitmap: StandInBitmap })

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

serveWorker<FixtureMethods>({
  echo: (input) => {
    log.ran.push(`echo:${input}`)

    return input
  },
  sleep: async (input) => {
    log.ran.push("sleep")
    await sleep(input)

    return undefined
  },
  spin: (input) => {
    log.ran.push("spin")

    const until = performance.now() + input

    while (performance.now() < until) {
      
    }

    const buffer = new ArrayBuffer(8)

    return new Transfer(buffer, [buffer])
  },
  hold: (_, signal) => {
    log.ran.push("hold")

    return new Promise((resolve) =>
      signal.addEventListener("abort", () => {
        log.aborted.push("hold")
        resolve(undefined)
      }),
    )
  },
  paint: async (input) => {
    log.ran.push("paint")
    await sleep(input)

    const bitmap = new ImageBitmap()

    return new Transfer(bitmap, [bitmap])
  },
  log: () => log,
})

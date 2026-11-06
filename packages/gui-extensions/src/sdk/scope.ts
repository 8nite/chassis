import type { Cleanup } from "./core"


export interface Scope {
  
  readonly signal: AbortSignal
  
  addFinalizer(fn: Cleanup): Cleanup
  
  fork(name: string): Scope
  
  close(): Promise<void>
}


type Log = <Data extends Readonly<Record<string, unknown>>>(message: string, data: Data) => void

type Options = {
  
  readonly timeout: number
  
  readonly log: Log
}


type Finalizer = { readonly label?: string; readonly run: Cleanup }


export const Scope = {
  
  make: (name: string, options: Options): Scope => create(name, options),
}

function create(name: string, options: Options, detach?: () => void): Scope {
  const controller = new AbortController()
  const finalizers = new Set<Finalizer>()
  
  const running = new Map<Promise<void>, string | undefined>()
  
  const closing = { closed: false, chain: Promise.resolve() }

  const start = (finalizer: Finalizer) => {
    const run: Promise<void> = Promise.resolve()
      .then(finalizer.run)
      .then(
        () => undefined,
        (cause: unknown) => options.log("scope finalizer failed", { scope: name, error: cause }),
      )
      .finally(() => running.delete(run))

    running.set(run, finalizer.label)

    return run
  }

  const settle = (deadline: Deadline) =>
    Promise.race([Promise.all([closing.chain, ...running.keys()]), deadline.passed])
      .then(() => undefined)
      .finally(deadline.cancel)

  const deadline = (): Deadline => {
    const passed = Promise.withResolvers<void>()

    const timer = setTimeout(() => {
      running.forEach((label, run) => {
        running.delete(run)

        if (label !== undefined) options.log("scope finalizer timed out", { scope: name, finalizer: label })
      })
      passed.resolve()
    }, options.timeout)

    return { passed: passed.promise, cancel: () => clearTimeout(timer) }
  }

  const scope: Scope = {
    signal: controller.signal,
    addFinalizer(fn) {
      const finalizer = { label: fn.name || "anonymous", run: fn }

      if (closing.closed) {
        void start(finalizer)

        return () => {}
      }

      finalizers.add(finalizer)

      return () => {
        if (finalizers.delete(finalizer)) return fn()
      }
    },
    fork(child) {
      const finalizer: Finalizer = { run: () => forked.close() }
      const forked = create(`${name}/${child}`, options, () => finalizers.delete(finalizer))

      if (closing.closed) void forked.close()
      else finalizers.add(finalizer)

      return forked
    },
    close() {
      if (closing.closed) return settle(deadline())
      detach?.()
      controller.abort()
      const first = deadline()
      const ordered = [...finalizers].reverse()
      finalizers.clear()
      closing.closed = true
      closing.chain = ordered.reduce(
        (chain: Promise<void>, finalizer) =>
          chain.then(() => Promise.race([start(finalizer), first.passed]).then(() => undefined)),
        Promise.resolve(),
      )

      return settle(first)
    },
  }

  return scope
}

type Deadline = { readonly passed: Promise<void>; readonly cancel: () => void }

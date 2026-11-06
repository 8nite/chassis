import { Scope, type Cleanup } from "@chassis/gui-extensions/sdk/main"


const CLEANUP_TIMEOUT_MS = 3_000


const SETUP_STALL_MS = 10_000


export interface Instance {
  readonly id: string
  
  readonly scope: Scope
  
  contribute(withdraw: () => void): Cleanup
}


export type Revision = (instance: Instance) => {
  
  readonly ready: Promise<unknown>
  readonly setup: () => void | Promise<void>
}


export type ErrorLog = <Data extends Readonly<Record<string, unknown>>>(message: string, data: Data) => void

type Outcome = { readonly ok: true } | { readonly ok: false; readonly error: unknown }


type Progress = { setup: Promise<Outcome | undefined>; disposed?: Promise<void> }

type Running = {
  readonly instance: Instance
  readonly revision: Revision
  readonly ready: Promise<unknown>
  
  good: boolean
  
  start(): Promise<Outcome>
  
  dispose(): Promise<void>
}


export function createLifecycle(input: {
  
  readonly loader: (id: string) => (() => Promise<Revision>) | undefined
  readonly enabled: (id: string) => boolean
  
  readonly changed: () => void
  readonly log: ErrorLog
}) {
  const active = new Map<string, Running>()
  
  const queues = new Map<string, Promise<void>>()
  
  
  const generations = new Map<string, AbortController>()
  
  const last = new Map<string, Revision>()
  const errors = new Map<string, string>()
  
  
  const kept = new Set<Scope>()
  const status = { quitting: false }

  const current = (id: string, signal: AbortSignal) => !signal.aborted && input.enabled(id) && !status.quitting

  const fail = (id: string, cause: unknown) => {
    errors.set(id, cause instanceof Error ? cause.message : String(cause))
    input.log("extension failed", { id, error: cause })
    input.changed()
  }

  const create = (id: string, revision: Revision): Running => {
    const scope = Scope.make(id, { timeout: CLEANUP_TIMEOUT_MS, log: input.log })
    
    const contributions = new Set<() => void>()

    const withdraw = (fn: () => void) => {
      
      try {
        fn()
      } catch (error) {
        input.log("extension withdrawal failed", { id, error })
      }
    }

    const instance: Instance = {
      id,
      scope,
      contribute(fn) {
        if (scope.signal.aborted) {
          withdraw(fn)

          return () => {}
        }

        const remove = () => {
          if (contributions.delete(remove)) fn()
        }

        contributions.add(remove)

        return remove
      },
    }

    const prepared = revision(instance)
    const progress: Progress = { setup: Promise.resolve(undefined) }

    return {
      instance,
      revision,
      ready: prepared.ready.catch(() => undefined),
      good: false,
      start() {
        const stall = setTimeout(() => input.log("extension setup stalled", { id, ms: SETUP_STALL_MS }), SETUP_STALL_MS)

        
        const outcome = Promise.resolve()
          .then(prepared.setup)
          .then(
            (): Outcome => ({ ok: true }),
            (cause: unknown): Outcome => ({ ok: false, error: cause }),
          )
          .finally(() => clearTimeout(stall))

        progress.setup = outcome

        return outcome
      },
      dispose() {
        if (progress.disposed) return progress.disposed

        
        const closed = scope.close()

        
        ;[...contributions].reverse().forEach(withdraw)

        
        const settled = within(
          progress.setup.then(() => scope.close()),
          () => input.log("extension cleanup timed out", { id }),
        )

        progress.disposed = Promise.all([closed, settled]).then(() => undefined)

        return progress.disposed
      },
    }
  }

  
  
  const enqueue = (id: string, task: () => Promise<void>) => {
    const step = (queues.get(id) ?? Promise.resolve()).then(task).then(() => undefined)

    const tail: Promise<void> = step
      .catch(() => undefined)
      .finally(() => {
        if (queues.get(id) === tail) queues.delete(id)
      })

    queues.set(id, tail)

    return step
  }

  const generation = (id: string) => {
    const existing = generations.get(id)

    if (existing) return existing.signal
    const created = new AbortController()
    generations.set(id, created)

    return created.signal
  }

  const stop = (id: string) => {
    generations.get(id)?.abort()
    generations.delete(id)
  }

  
  const load = (id: string, signal: AbortSignal, loader: () => Promise<Revision>) =>
    until(
      signal,
      loader().catch((cause: unknown) => {
        if (current(id, signal)) fail(id, cause)

        return undefined
      }),
    )

  
  const run = async (id: string, signal: AbortSignal, revision: Revision) => {
    const running = create(id, revision)
    active.set(id, running)
    await until(signal, running.ready)

    
    if (!current(id, signal)) {
      if (active.get(id) === running) active.delete(id)
      await running.dispose()

      return undefined
    }

    const outcome = await until(signal, running.start())

    
    if (!outcome) {
      await running.dispose()

      return undefined
    }

    if (active.get(id) !== running) return undefined

    if (outcome.ok) {
      running.good = true
      last.set(id, revision)

      return outcome
    }

    fail(id, outcome.error)
    active.delete(id)
    await running.dispose()

    return outcome
  }

  const activate = (id: string) => {
    const signal = generation(id)

    return enqueue(id, async () => {
      const loader = input.loader(id)

      if (!loader || active.has(id) || !current(id, signal)) return
      errors.delete(id)
      const revision = await load(id, signal, loader)

      
      if (!revision || active.has(id) || !current(id, signal)) return
      await run(id, signal, revision)
    })
  }

  
  const deactivate = (id: string, after?: () => void) => {
    stop(id)
    last.delete(id)
    const running = active.get(id)
    active.delete(id)
    void running?.dispose()

    return enqueue(id, async () => {
      await running?.dispose()
      after?.()
    })
  }

  
  const reload = (id: string) => {
    errors.delete(id)
    stop(id)
    const previous = active.get(id)
    
    const stopped = previous && !previous.good ? previous : undefined

    if (stopped) {
      active.delete(id)
      void stopped.dispose()
    }

    const signal = generation(id)

    return enqueue(id, async () => {
      await stopped?.dispose()
      const loader = input.loader(id)

      if (!loader || !current(id, signal)) return
      const fallback = last.get(id)
      const revision = await load(id, signal, loader)

      if (!current(id, signal)) return
      const running = active.get(id)

      if (!revision) {
        if (!running && fallback) await run(id, signal, fallback)

        return
      }

      if (running) {
        active.delete(id)
        await running.dispose()

        if (!current(id, signal)) return
      }

      const outcome = await run(id, signal, revision)

      if (outcome?.ok === false && fallback) await run(id, signal, fallback)
    })
  }

  return {
    activate,
    deactivate,
    reload,
    failure: (id: string) => errors.get(id),
    forget(id: string) {
      errors.delete(id)
    },
    
    restart(keep: Scope, handoff: () => Promise<void>) {
      if (![...active.values()].some((running) => running.instance.scope === keep))
        return Promise.reject(new Error("Lifecycle.restart keeps only an active extension's ctx.scope"))
      kept.add(keep)

      return Promise.resolve()
        .then(handoff)
        .finally(() => kept.delete(keep))
    },
    
    async dispose() {
      status.quitting = true
      
      await Promise.all(
        [...new Set([...active.keys(), ...queues.keys()])].flatMap((id) => {
          const running = active.get(id)

          return running && kept.has(running.instance.scope) ? [] : [deactivate(id)]
        }),
      )
    },
  }
}


function until<T>(signal: AbortSignal, promise: Promise<T>) {
  if (signal.aborted) return Promise.resolve(undefined)

  return new Promise<T | undefined>((resolve, reject) => {
    const abort = () => resolve(undefined)
    signal.addEventListener("abort", abort, { once: true })
    void promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort))
  })
}


function within(promise: Promise<void>, timedOut: () => void) {
  const deadline = Promise.withResolvers<void>()

  const timer = setTimeout(() => {
    timedOut()
    deadline.resolve()
  }, CLEANUP_TIMEOUT_MS)

  return Promise.race([promise, deadline.promise]).finally(() => clearTimeout(timer))
}

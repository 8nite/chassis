import {
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  getOwner,
  on,
  onCleanup,
  runWithOwner,
  untrack,
  type Accessor,
} from "solid-js"
import { createStore } from "solid-js/store"
import { Live } from "./core"
import { LifetimeContext, useExtension } from "./solid"

type Falsy = undefined | null | false


export type KeyedSource = Accessor<unknown>


export type KeyedValue<S> =
  S extends Accessor<Live<infer T>> ? T : S extends Accessor<infer T> ? Exclude<T, Falsy> : never


type Run = { readonly value: unknown; readonly generation?: number } | undefined


export function createKeyed<S extends KeyedSource>(
  source: S,
  fn: (value: KeyedValue<S>) => void,
  options?: {
    
    readonly otherwise?: () => void
    
    readonly equals?: (previous: KeyedValue<S>, next: KeyedValue<S>) => boolean
  },
) {
  const read: KeyedSource = source
  const same = options?.equals

  const active = Live.is(read)
    ? createMemo<Run>(
        () => {
          const value = read()

          return value.status === "active" ? value : undefined
        },
        undefined,
        
        { equals: (previous, next) => previous?.generation === next?.generation },
      )
    : createMemo<Run>(
        () => {
          const value = read()

          return value === undefined || value === null || value === false ? undefined : { value }
        },
        undefined,
        {
          equals: (previous, next) => {
            if (previous === undefined || next === undefined) return previous === next

            
            return (
              previous.value === next.value || !!same?.(previous.value as KeyedValue<S>, next.value as KeyedValue<S>)
            )
          },
        },
      )

  createRenderEffect(
    on(active, (current) => {
      
      const run = current === undefined ? options?.otherwise : () => fn(current.value as KeyedValue<S>)

      if (!run) return

      
      const lifetime = { ended: false }
      const scope = createRoot((dispose) => ({ owner: getOwner(), dispose }))

      onCleanup(() => {
        lifetime.ended = true
        scope.dispose()
      })

      if (scope.owner) scope.owner.context = { ...scope.owner.context, [LifetimeContext.id]: lifetime }
      runWithOwner(scope.owner, run)
    }),
  )
}


export function createLatest<S extends KeyedSource, T>(
  source: S,
  fetch: (value: KeyedValue<S>, signal: AbortSignal) => Promise<T>,
): {
  
  readonly latest: T | undefined
  
  readonly loading: boolean
  
  readonly error: unknown
} {
  const [state, setState] = createStore<{ latest: T | undefined; loading: boolean; error: unknown }>({
    latest: undefined,
    loading: false,
    error: undefined,
  })

  createKeyed(
    source,
    (value) => {
      const controller = new AbortController()

      onCleanup(() => controller.abort())
      setState({ loading: true, error: undefined })
      void Promise.try(() => fetch(value, controller.signal)).then(
        (latest) => {
          if (!controller.signal.aborted) setState({ latest, loading: false, error: undefined })
        },
        (cause: unknown) => {
          if (!controller.signal.aborted) setState({ loading: false, error: cause })
        },
      )
    },
    { otherwise: () => setState({ loading: false, error: undefined }) },
  )

  return state
}


export function createVisitState<T>(initial: T) {
  const sessions = useExtension().sessions
  const visit = () => sessions.current()?.visit

  const [state, setState] = createSignal<{ readonly visit: object | undefined; readonly value: T }>({
    visit: undefined,
    value: initial,
  })

  const value = () => {
    const current = state()

    return current.visit !== undefined && current.visit === visit() ? current.value : initial
  }

  const set = (next: T) => void setState({ visit: untrack(visit), value: next })

  return [value, set] as const
}

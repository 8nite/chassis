import { Effect } from "effect"


export const withProcessEnv =
  (env: Record<string, string | undefined>) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const previous = Object.fromEntries(Object.keys(env).map((name) => [name, process.env[name]]))
        apply(env)
        return previous
      }),
      () => effect,
      (previous) => Effect.sync(() => apply(previous)),
    )

const apply = (env: Record<string, string | undefined>) => {
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[name]
      continue
    }
    process.env[name] = value
  }
}

import { Clock, Duration, Effect, Schedule, Schema, Stream } from "effect"
import { AIError, TimeoutError } from "./schema/errors.js"

export const Status = Schema.Literals(["queued", "running", "completed", "failed", "cancelled", "expired"])
export type Status = Schema.Schema.Type<typeof Status>


export interface Snapshot {
  readonly id: string
  readonly status: Status
  
  readonly progress?: number
  readonly position?: number
}


export interface Route<Response> {
  readonly status: Effect.Effect<Snapshot, AIError>
  readonly result: Effect.Effect<Response, AIError>
  readonly cancel?: Effect.Effect<void, AIError>
}

export interface Poll {
  readonly interval?: Duration.Input
  readonly timeout?: Duration.Input
}

export interface AwaitOptions {
  readonly poll?: Poll
}

export const DEFAULT_POLL_INTERVAL = Duration.seconds(5)
export const DEFAULT_POLL_TIMEOUT = Duration.minutes(10)

export const QueuedEvent = Schema.Struct({
  type: Schema.tag("generation-queued"),
  id: Schema.String,
  position: Schema.optional(Schema.Number),
}).annotate({ identifier: "Generation.Event.Queued" })

export const ProgressEvent = Schema.Struct({
  type: Schema.tag("generation-progress"),
  id: Schema.String,
  progress: Schema.optional(Schema.Number),
}).annotate({ identifier: "Generation.Event.Progress" })

export type Observation = Schema.Schema.Type<typeof QueuedEvent> | Schema.Schema.Type<typeof ProgressEvent>

export type Event = Observation | { readonly type: "generation-finished"; readonly id: string; readonly status: Status }

const TERMINAL: ReadonlySet<Status> = new Set(["completed", "failed", "cancelled", "expired"])

export const isTerminal = (status: Status) => TERMINAL.has(status)

export class Generation<Response> {
  readonly id: string
  readonly status: Status
  readonly progress?: number
  readonly position?: number

  constructor(
    readonly route: Route<Response>,
    
    readonly token: unknown,
    snapshot: Snapshot,
  ) {
    this.id = snapshot.id
    this.status = snapshot.status
    this.progress = snapshot.progress
    this.position = snapshot.position
  }

  get snapshot(): Snapshot {
    return {
      id: this.id,
      status: this.status,
      progress: this.progress,
      position: this.position,
    }
  }

  get terminal() {
    return isTerminal(this.status)
  }

  refresh(): Effect.Effect<Generation<Response>, AIError> {
    return this.route.status.pipe(Effect.map((snapshot) => new Generation(this.route, this.token, snapshot)))
  }

  
  result(): Effect.Effect<Response, AIError> {
    return this.route.result
  }

  
  await(options?: AwaitOptions): Effect.Effect<Response, AIError> {
    const timeout = Duration.fromInputUnsafe(options?.poll?.timeout ?? DEFAULT_POLL_TIMEOUT)
    const settled = this.terminal ? Effect.succeed(this) : this.poll(options?.poll)
    return settled.pipe(
      
      Effect.flatMap((generation) => generation.result()),
      Effect.timeoutOrElse({ duration: timeout, orElse: () => timeoutError(this.id, timeout) }),
    )
  }

  cancel(): Effect.Effect<void, AIError> {
    return this.route.cancel ?? Effect.void
  }

  
  events(options?: AwaitOptions): Stream.Stream<Event, AIError> {
    if (this.terminal) return Stream.make(this.event())
    const timeout = Duration.fromInputUnsafe(options?.poll?.timeout ?? DEFAULT_POLL_TIMEOUT)
    return Stream.unwrap(
      Clock.currentTimeMillis.pipe(
        Effect.map((start) => {
          const deadline = start + Duration.toMillis(timeout)
          const refresh = within(this.refresh(), this.id, timeout, deadline)
          const schedule = this.schedule(options?.poll).pipe(
            Schedule.modifyDelay((meta) =>
              Effect.succeed(Duration.min(meta.duration, Duration.millis(Math.max(0, deadline - meta.now)))),
            ),
          )
          return Stream.fromEffectSchedule(refresh, schedule).pipe(
            Stream.takeUntil((generation) => generation.terminal),
            Stream.map((generation) => generation.event()),
          )
        }),
      ),
    )
  }

  private event(): Event {
    if (this.terminal) return { type: "generation-finished", id: this.id, status: this.status }
    if (this.status === "queued") return { type: "generation-queued", id: this.id, position: this.position }
    return { type: "generation-progress", id: this.id, progress: this.progress }
  }

  private poll(poll: Poll | undefined) {
    return this.refresh().pipe(
      Effect.repeat({ schedule: this.schedule(poll), until: (generation) => generation.terminal }),
    )
  }

  private schedule(poll: Poll | undefined) {
    return Schedule.spaced(poll?.interval ?? DEFAULT_POLL_INTERVAL)
  }
}


export const resultEvents = <Response, A>(
  generation: Generation<Response>,
  expand: (response: Response) => ReadonlyArray<A>,
  options?: AwaitOptions,
): Stream.Stream<Observation | A, AIError> => {
  const timeout = Duration.fromInputUnsafe(options?.poll?.timeout ?? DEFAULT_POLL_TIMEOUT)
  return Stream.unwrap(
    Clock.currentTimeMillis.pipe(
      Effect.map((start) =>
        generation.events(options).pipe(
          Stream.filter((event): event is Observation => event.type !== "generation-finished"),
          Stream.concat(
            Stream.fromIterableEffect(
              within(generation.result(), generation.id, timeout, start + Duration.toMillis(timeout)).pipe(
                Effect.map(expand),
              ),
            ),
          ),
        ),
      ),
    ),
  )
}


const within = <A>(effect: Effect.Effect<A, AIError>, id: string, timeout: Duration.Duration, deadline: number) =>
  Clock.currentTimeMillis.pipe(
    Effect.flatMap((now) =>
      now >= deadline
        ? Effect.fail(timeoutError(id, timeout))
        : effect.pipe(
            Effect.timeoutOrElse({
              duration: Duration.millis(deadline - now),
              orElse: () => Effect.fail(timeoutError(id, timeout)),
            }),
          ),
    ),
  )

const timeoutError = (id: string, timeout: Duration.Duration) =>
  new AIError({
    reason: new TimeoutError({
      message: `Generation ${id} did not finish within ${Duration.format(timeout)}`,
      timeoutMs: Duration.toMillis(timeout),
    }),
  })

export * as Snapshot from "./snapshot.js"

import { makeLocationNode } from "@chassis/util/effect/app-node"
import path from "path"
import { Clock, Context, Effect, Fiber, Layer, Schema, Scope } from "effect"
import { FileDiff } from "@chassis/schema/file-diff"
import { FSUtil } from "@chassis/util/fs-util"
import { Git } from "./git.js"
import { Global } from "@chassis/util/global"
import { Location } from "./location.js"
import { AbsolutePath, RelativePath } from "./schema.js"
import { ID } from "@chassis/schema/snapshot"
import { Hash } from "@chassis/util/hash"
import { State } from "./state.js"

export { ID }

export class Error extends Schema.TaggedError<Error>()("Snapshot.Error", {
  operation: Schema.Literals(["capture", "files", "diff", "restore"]),
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

export interface CompareInput {
  readonly from: ID
  readonly to: ID
}

export interface DiffInput extends CompareInput {
  readonly context?: number
  readonly paths?: readonly RelativePath[]
}

export interface RestoreInput {
  
  readonly files: ReadonlyMap<RelativePath, ID>
}

export type Editor = {
  configure: (enabled: boolean) => void
}

export interface Interface extends State.Transformable<Editor> {
  
  readonly capture: () => Effect.Effect<ID | undefined>

  
  readonly files: (input: CompareInput) => Effect.Effect<readonly RelativePath[], Error>

  
  readonly diff: (input: DiffInput) => Effect.Effect<readonly FileDiff.Info[], Error>

  
  readonly restore: (input: RestoreInput) => Effect.Effect<void, Error>
}

export class Service extends Context.Service<Service, Interface>()("@chassis/Snapshot") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const git = yield* Git.Service
    const global = yield* Global.Service
    const location = yield* Location.Service
    const lifetime = yield* Scope.Scope
    const state = State.create<{ enabled: boolean }, Editor>({
      name: "snapshot",
      initial: () => ({ enabled: true }),
      editor: (editor) => ({
        configure: (enabled) => {
          editor.enabled = enabled
        },
      }),
    })
    
    const repositoryFiber = yield* Effect.cached(
      Effect.gen(function* () {
        const source = yield* git.repo.discover(location.project.directory)
        if (!source) return yield* new Error({ operation: "capture", message: "Project is not a Git repository" })
        const worktree = AbsolutePath.make(yield* fs.realPath(source.worktree).pipe(Effect.orDie))
        const gitDirectory = AbsolutePath.make(
          path.join(global.data, "snapshot", location.project.id, Hash.fast(worktree)),
        )
        const snapshotRepository = (yield* fs.existsSafe(path.join(gitDirectory, "HEAD")))
          ? new Git.Repository({ worktree, gitDirectory, commonDirectory: gitDirectory })
          : yield* git.repo
              .create({ worktree, gitDirectory, seed: source })
              .pipe(Effect.mapError((cause) => failure("capture", cause)))
        return { source, worktree, snapshotRepository }
      }).pipe(Effect.forkIn(lifetime)),
    )
    const repository = repositoryFiber.pipe(Effect.uninterruptible, Effect.flatMap(Fiber.join))

    const scope = Effect.fnUntraced(function* (worktree: AbsolutePath) {
      if (!FSUtil.contains(worktree, location.directory))
        return yield* new Error({ operation: "capture", message: "Location is outside the project" })
      return RelativePath.make(path.relative(worktree, location.directory).replaceAll("\\", "/") || ".")
    })

    const enabled = () => location.vcs?.type === "git" && state.get().enabled

    
    let lastPackCheck = Number.NEGATIVE_INFINITY
    const packWhenDue = Effect.fnUntraced(function* (repository: Git.Repository) {
      const now = yield* Clock.currentTimeMillis
      if (now - lastPackCheck < 10 * 60 * 1000) return
      lastPackCheck = now
      yield* git.objects.pack(repository).pipe(
        Effect.catch((cause) => Effect.logWarning("failed to pack snapshot objects", { cause })),
        Effect.forkIn(lifetime),
      )
    })

    const capture = Effect.fn("Snapshot.capture")(function* () {
      if (!enabled()) return undefined
      return yield* Effect.gen(function* () {
        const repo = yield* repository
        const tree = yield* git.tree.capture({
          repository: repo.snapshotRepository,
          scopes: [yield* scope(repo.worktree)],
          ignores: repo.source,
          maximumUntrackedFileBytes: 2 * 1024 * 1024,
        })
        yield* packWhenDue(repo.snapshotRepository)
        return ID.make(tree)
      }).pipe(
        Effect.catch((cause) => Effect.logWarning("failed to capture snapshot", { cause }).pipe(Effect.as(undefined))),
      )
    })

    const comparison = Effect.fnUntraced(function* (operation: "files" | "diff", input: CompareInput) {
      const repo = yield* repository.pipe(Effect.mapError((cause) => failure(operation, cause)))
      return {
        source: repo.source,
        repository: repo.snapshotRepository,
        from: Git.TreeID.make(input.from),
        to: Git.TreeID.make(input.to),
      }
    })

    
    const ignored = Effect.fnUntraced(function* (
      operation: "files" | "diff",
      source: Git.Repository,
      paths: readonly RelativePath[],
    ) {
      return yield* git.index
        .ignored({ repository: source, paths })
        .pipe(Effect.mapError((cause) => failure(operation, cause)))
    })

    const files = Effect.fn("Snapshot.files")(function* (input: CompareInput) {
      const compared = yield* comparison("files", input)
      const changed = yield* git.tree
        .files({ repository: compared.repository, from: compared.from, to: compared.to })
        .pipe(Effect.mapError((cause) => failure("files", cause)))
      const skipped = yield* ignored("files", compared.source, changed)
      return changed.filter((file) => !skipped.has(file))
    })

    const diff = Effect.fn("Snapshot.diff")(function* (input: DiffInput) {
      if (input.paths?.length === 0) return []
      const compared = yield* comparison("diff", input)
      
      const diffs = yield* git.tree
        .diff({
          repository: compared.repository,
          from: compared.from,
          to: compared.to,
          context: input.context,
          paths: input.paths,
        })
        .pipe(Effect.mapError((cause) => failure("diff", cause)))
      const skipped = yield* ignored(
        "diff",
        compared.source,
        diffs.map((file) => RelativePath.make(file.file)),
      )
      return diffs.filter((file) => !skipped.has(RelativePath.make(file.file)))
    })

    const plan = Effect.fnUntraced(function* (worktree: AbsolutePath, input: RestoreInput) {
      const files = new Map<RelativePath, Git.TreeID>()
      for (const [file, snapshot] of input.files) {
        const absolute = path.resolve(worktree, file)
        if (!FSUtil.contains(worktree, absolute))
          return yield* new Error({ operation: "restore", message: `Path escapes the project: ${file}` })
        files.set(file, Git.TreeID.make(snapshot))
      }
      return files
    })

    const restore = Effect.fn("Snapshot.restore")(function* (input: RestoreInput) {
      if (!enabled()) return yield* new Error({ operation: "restore", message: "Snapshots are disabled" })
      const repo = yield* repository.pipe(Effect.mapError((cause) => failure("restore", cause)))
      yield* git.tree
        .restore({ repository: repo.snapshotRepository, files: yield* plan(repo.worktree, input) })
        .pipe(Effect.mapError((cause) => failure("restore", cause)))
    })

    return Service.of({ transform: state.transform, reload: state.reload, capture, files, diff, restore })
  }).pipe(Effect.withSpan("Snapshot.boot")),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [FSUtil.node, Git.node, Global.node, Location.node],
})

export const noopLayer = Layer.succeed(
  Service,
  Service.of({
    transform: () => Effect.succeed({ dispose: Effect.void }),
    reload: () => Effect.void,
    capture: () => Effect.undefined,
    files: () => Effect.succeed([]),
    diff: () => Effect.succeed([]),
    restore: () => Effect.void,
  }),
)

function failure(operation: Error["operation"], cause: unknown) {
  if (cause instanceof Error && cause.operation === operation) return cause
  return new Error({
    operation,
    message: cause instanceof globalThis.Error ? cause.message : String(cause),
    cause,
  })
}

import { Effect, Schema } from "effect"

export const FileType = Schema.Literals(["file", "directory", "symlink", "other"])
export type FileType = typeof FileType.Type

export interface FileInfo {
  readonly type: FileType
  readonly size: number
  readonly mtimeMs: number
}

export interface DirEntry {
  readonly name: string
  readonly type: FileType
}

export class NotFound extends Schema.TaggedError<NotFound>()("Environment.NotFound", {
  path: Schema.String,
}) {}

export class WrongKind extends Schema.TaggedError<WrongKind>()("Environment.WrongKind", {
  path: Schema.String,
  actual: FileType,
}) {}

export class Failed extends Schema.TaggedError<Failed>()("Environment.Failed", {
  path: Schema.String,
  cause: Schema.Defect(),
}) {}

export interface FilesImpl {
  
  readonly read: (
    path: string,
    range?: { readonly offset: number; readonly length: number },
  ) => Effect.Effect<{ readonly info: FileInfo; readonly bytes: Uint8Array }, NotFound | WrongKind | Failed>
  readonly write: (path: string, bytes: Uint8Array) => Effect.Effect<void, Failed>
  
  readonly stat: (path: string) => Effect.Effect<FileInfo, NotFound | Failed>
  
  readonly list: (path: string) => Effect.Effect<ReadonlyArray<DirEntry>, NotFound | WrongKind | Failed>
  readonly remove: (path: string) => Effect.Effect<void, Failed>
  readonly move: (from: string, to: string) => Effect.Effect<void, NotFound | Failed>
  readonly mkdir: (path: string) => Effect.Effect<void, Failed>
}

export interface Files extends FilesImpl {}


export const typeFollowing = (files: Files, path: string) =>
  files.stat(path).pipe(
    Effect.flatMap((info) =>
      info.type === "symlink"
        ? files.read(path, { offset: 0, length: 0 }).pipe(
            Effect.map((result) => result.info.type),
            Effect.catchTag("Environment.WrongKind", (error) => Effect.succeed(error.actual)),
          )
        : Effect.succeed(info.type),
    ),
  )

export * as EnvironmentFiles from "./files.js"

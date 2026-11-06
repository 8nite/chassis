export * as RetainedImage from "./retained-image"

import { Effect, FileSystem } from "effect"
import { randomBytes } from "node:crypto"
import path from "node:path"






const pattern = /^chassis-(?:service|upgrade)-(\d+)-[0-9a-f]+\.exe$/


export const retain = Effect.fnUntraced(function* (directory: string, role: "service" | "upgrade") {
  const fs = yield* FileSystem.FileSystem
  return yield* Effect.acquireRelease(
    Effect.gen(function* () {
      yield* fs.makeDirectory(directory, { recursive: true }).pipe(Effect.ignore)
      const names = yield* fs.readDirectory(directory).pipe(Effect.orElseSucceed((): string[] => []))
      yield* Effect.forEach(names, (name) =>
        Effect.gen(function* () {
          const pid = Number(pattern.exec(name)?.[1])
          if (!pid || (yield* alive(pid))) return
          yield* fs.remove(path.join(directory, name)).pipe(Effect.ignore)
        }),
      )
      const target = path.join(directory, `chassis-${role}-${process.pid}-${randomBytes(4).toString("hex")}.exe`)
      const executable = yield* fs.realPath(process.execPath).pipe(Effect.orElseSucceed(() => process.execPath))
      return yield* fs.link(executable, target).pipe(
        Effect.as(target),
        Effect.tapError((cause) => Effect.logWarning("could not link the running binary", { cause })),
        Effect.orElseSucceed(() => undefined),
      )
    }),
    
    (target) => (target === undefined ? Effect.void : fs.remove(target).pipe(Effect.ignore)),
  )
})


export const relocate = Effect.fnUntraced(function* (directory: string, destination: string) {
  const fs = yield* FileSystem.FileSystem
  const names = yield* fs.readDirectory(directory).pipe(Effect.orElseSucceed((): string[] => []))
  const links = names.filter((name) => pattern.test(name))
  if (links.length === 0) return
  yield* fs.makeDirectory(destination, { recursive: true }).pipe(Effect.ignore)
  yield* Effect.forEach(links, (name) =>
    fs.rename(path.join(directory, name), path.join(destination, name)).pipe(Effect.ignore),
  )
})


export function installed(home: string) {
  const runtime = path.basename(process.execPath, path.extname(process.execPath)).toLowerCase()
  if (runtime === "bun" || runtime === "node" || runtime === "nodejs") return false
  const executable = path.resolve(process.execPath)
  return (
    executable.split(path.sep).includes("node_modules") ||
    executable === path.resolve(home, ".chassis", "bin", "chassis.exe")
  )
}


const alive = (pid: number) =>
  Effect.try({ try: () => process.kill(pid, 0), catch: (cause) => cause }).pipe(
    Effect.as(true),
    Effect.catch((cause) => Effect.succeed(!(cause instanceof Error && "code" in cause && cause.code === "ESRCH"))),
  )

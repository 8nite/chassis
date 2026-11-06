import { NodeServices } from "@effect/platform-node"
import { expect } from "bun:test"
import { Effect, FileSystem } from "effect"
import { realpathSync, statSync } from "node:fs"
import path from "node:path"
import { RetainedImage } from "../src/services/retained-image"
import { testEffect } from "../../core/test/lib/effect"

const it = testEffect(NodeServices.layer)

const windows = process.platform === "win32" ? it.live : it.live.skip

windows("retain hard-links the running image for the scope and sweeps only links of exited processes", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "chassis-retained-" })
    
    const kept = ["chassis-service-4-aa.exe", `chassis-service-${process.pid}-bb.exe`, "unrelated.exe"]
    yield* Effect.forEach([...kept, "chassis-upgrade-999999999-cc.exe"], (name) =>
      fs.writeFileString(path.join(directory, name), name),
    )
    const image = statSync(realpathSync(process.execPath))
    yield* Effect.scoped(
      Effect.gen(function* () {
        const link = yield* RetainedImage.retain(directory, "upgrade")
        if (!link) return yield* Effect.die("Expected a link")
        expect(path.basename(link)).toMatch(new RegExp(`^chassis-upgrade-${process.pid}-[0-9a-f]{8}\\.exe$`))
        expect(statSync(link).ino).toBe(image.ino)
        expect(statSync(link).nlink).toBe(image.nlink + 1)
        expect((yield* fs.readDirectory(directory)).sort()).toEqual([...kept, path.basename(link)].sort())
      }),
    )
    
    expect((yield* fs.readDirectory(directory)).sort()).toEqual(kept.sort())
  }),
)

windows("retain tolerates a directory it cannot link into", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "chassis-retained-" })
    const file = path.join(root, "not-a-directory")
    yield* fs.writeFileString(file, "")
    expect(yield* Effect.scoped(RetainedImage.retain(file, "service"))).toBeUndefined()
  }),
)

windows("relocate moves only retained links out of a directory", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "chassis-retained-" })
    const cache = path.join(root, "cache")
    const tmp = path.join(root, "tmp")
    yield* fs.makeDirectory(cache)
    yield* fs.writeFileString(path.join(cache, "chassis-upgrade-1-ab.exe"), "link")
    yield* fs.writeFileString(path.join(cache, "models.json"), "{}")
    yield* RetainedImage.relocate(cache, tmp)
    expect(yield* fs.readDirectory(cache)).toEqual(["models.json"])
    expect(yield* fs.readDirectory(tmp)).toEqual(["chassis-upgrade-1-ab.exe"])
  }),
)

windows("installed accepts package-manager and curl binaries only", () =>
  Effect.gen(function* () {
    const home = path.join("C:", "Users", "someone")
    const original = process.execPath
    yield* Effect.addFinalizer(() => Effect.sync(() => (process.execPath = original)))
    const cases = [
      [path.join(home, ".bun", "install", "global", "node_modules", "@chassis", "cli", "bin", "chassis.exe"), true],
      [path.join(home, ".chassis", "bin", "chassis.exe"), true],
      [path.join(home, "AppData", "Local", "Programs", "Chassis", "resources", "chassis-cli.exe"), false],
      [path.join(home, "node_modules", "bun", "bin", "bun.exe"), false],
    ] as const
    const results = cases.map(([executable]) => {
      process.execPath = executable
      return RetainedImage.installed(home)
    })
    expect(results).toEqual(cases.map(([, expected]) => expected))
  }),
)

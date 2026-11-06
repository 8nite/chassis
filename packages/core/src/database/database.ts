export * as Database from "./database.js"

import { EffectDrizzleSqlite } from "./drizzle.js"
import { sqliteLayer, supportsForeignKeyToggle, supportsTuningPragmas } from "#sqlite"
import { Context, Effect, Layer, Schema, Semaphore } from "effect"
import type { SqlClient } from "effect/sql"
import { Global } from "@chassis/util/global"
import { closeSync, existsSync, openSync } from "node:fs"
import { chmod } from "node:fs/promises"
import { isAbsolute, join } from "path"
import { DatabaseMigration } from "./migration.js"
import { makeGlobalNode } from "@chassis/util/effect/app-node"

const makeDatabase = EffectDrizzleSqlite.makeWithDefaults()
type DatabaseShape = Effect.Success<typeof makeDatabase>

export interface Interface {
  db: DatabaseShape
}

export const Options = Schema.Struct({
  path: Schema.optional(Schema.String),
})
export type Options = typeof Options.Type

export class Service extends Context.Service<Service, Interface>()("@chassis/storage/Database") {}






const databaseLayer = (lock: Effect.Effect<Semaphore.Semaphore>) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const db = yield* makeDatabase

      if (supportsTuningPragmas) {
        yield* db.run("PRAGMA journal_mode = WAL")
        yield* db.run("PRAGMA synchronous = NORMAL")
        yield* db.run("PRAGMA busy_timeout = 5000")
        yield* db.run("PRAGMA cache_size = -64000")
        yield* db.run("PRAGMA wal_checkpoint(PASSIVE)")
      }
      
      if (supportsForeignKeyToggle) yield* db.run("PRAGMA foreign_keys = ON")
      const semaphore = yield* lock
      yield* semaphore.withPermit(DatabaseMigration.apply(db))

      return { db }
    }).pipe(Effect.orDie),
  )



const locks = new Map<string, Semaphore.Semaphore>()

function lockFor(filename: string) {
  const existing = locks.get(filename)
  if (existing) return existing
  const lock = Semaphore.makeUnsafe(1)
  locks.set(filename, lock)
  return lock
}

export function layer(options: Options = { path: ":memory:" }) {
  return Layer.unwrap(
    Effect.gen(function* () {
      const provide = (filename: string) =>
        databaseLayer(filename === ":memory:" ? Semaphore.make(1) : Effect.succeed(lockFor(filename))).pipe(
          Layer.provide(sqliteLayer({ filename })),
        )
      const filename = options.path ?? ":memory:"
      if (filename === ":memory:") return provide(filename)
      const file = isAbsolute(filename) ? filename : join((yield* Global.Service).data, filename)
      yield* Effect.promise(() => restrictToOwner(file))
      return provide(file)
    }),
  )
}



async function restrictToOwner(filename: string) {
  if (process.platform === "win32") return
  
  
  if (!existsSync(filename)) closeSync(openSync(filename, "a", 0o600))
  await chmod(filename, 0o600)
  await Promise.all(
    [`${filename}-wal`, `${filename}-shm`].map((file) =>
      chmod(file, 0o600).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error
      }),
    ),
  )
}






export const layerFromClient: Layer.Layer<Service, never, SqlClient.SqlClient | Global.Service> = databaseLayer(
  Semaphore.make(1),
)

export function configured(options?: Options) {
  return makeGlobalNode({ service: Service, layer: layer(options), deps: [Global.node] })
}


export function configuredClient(client: Layer.Layer<SqlClient.SqlClient>) {
  return makeGlobalNode({
    service: Service,
    layer: layerFromClient.pipe(Layer.provide(client)),
    deps: [Global.node],
  })
}

export const node = configured({ path: ":memory:" })

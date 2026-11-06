import { and, eq, sql } from "drizzle-orm"
import type { Database } from "./database"
import { state } from "./schema"
import { createWriteBehind } from "./write-behind"

export type StateStore = ReturnType<typeof createStateStore>

type Row = { name: string; key: string; value: string | null }



export function createStateStore(db: Database, input: { onError?: (error: unknown) => void } = {}) {
  
  const byKey = and(eq(state.name, sql.placeholder("name")), eq(state.key, sql.placeholder("key")))
  const read = db.select({ value: state.value }).from(state).where(byKey).prepare()
  const remove = db.delete(state).where(byKey).prepare()

  const upsert = db
    .insert(state)
    .values({
      name: sql.placeholder("name"),
      key: sql.placeholder("key"),
      value: sql.placeholder("value"),
      updated_at: sql.placeholder("updated_at"),
    })
    .onConflictDoUpdate({
      target: [state.name, state.key],
      set: { value: sql.placeholder("value"), updated_at: sql.placeholder("updated_at") },
    })
    .prepare()

  const writer = createWriteBehind<Row>({
    delay: 250,
    onError: input.onError,
    write: (batch) =>
      db.transaction(() => {
        const updated_at = Date.now()

        for (const row of batch.values()) {
          if (row.value === null) remove.run({ name: row.name, key: row.key })
          else upsert.run({ name: row.name, key: row.key, value: row.value, updated_at })
        }
      }),
  })

  const id = (name: string, key: string) => `${name}\0${key}`
  const set = (name: string, key: string, value: string) => writer.set(id(name, key), { name, key, value })
  const unset = (name: string, key: string) => writer.set(id(name, key), { name, key, value: null })
  
  
  
  let revision = 0

  return {
    get(name: string, key: string) {
      const queued = writer.get(id(name, key))

      if (queued) return queued.value

      return read.get({ name, key })?.value ?? null
    },
    set,
    delete: unset,
    
    
    items(name: string) {
      const items = Object.fromEntries(
        db
          .select({ key: state.key, value: state.value })
          .from(state)
          .where(eq(state.name, name))
          .all()
          .map((row) => [row.key, row.value]),
      )

      for (const row of writer.entries()) {
        if (row.name !== name) continue

        if (row.value === null) delete items[row.key]
        else items[row.key] = row.value
      }

      return { items, revision }
    },
    update(name: string, insert: Record<string, string>, removed: readonly string[]) {
      for (const [key, value] of Object.entries(insert)) set(name, key, value)

      for (const key of removed) unset(name, key)

      return ++revision
    },
    
    clear(name: string) {
      writer.drop((row) => row.name === name)
      db.delete(state).where(eq(state.name, name)).run()
    },
    flush: writer.flush,
    close: writer.close,
  }
}

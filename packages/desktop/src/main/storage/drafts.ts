import { createHash } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import type { Database } from "./database"
import { blobs, document } from "./schema"
import { createWriteBehind } from "./write-behind"

export type DraftStore = ReturnType<typeof createDraftStore>


const collectInterval = 60_000




export const blobGrace = 15 * 60_000



const referenced = (value: unknown) => sql`
  SELECT json_extract(node.value, '$.id') AS id
  FROM json_tree(${value}) AS node
  WHERE node.key = 'blob' AND node.type = 'object' AND json_type(node.value, '$.id') = 'text'
  UNION
  SELECT chunk.value AS id
  FROM json_tree(${value}) AS node, json_each(node.value, '$.ids') AS chunk
  WHERE node.key = 'blob' AND node.type = 'object' AND json_type(node.value, '$.ids') = 'array'
`

export function createDraftStore(
  db: Database,
  input: { collectDelay?: number; onError?: (error: unknown) => void } = {},
) {
  
  
  
  const startup = setTimeout(() => collectBlobs(db, Date.now() - blobGrace), input.collectDelay ?? 10_000)
  startup.unref()
  let collected = Date.now()
  let orphans = false
  const byKey = eq(document.key, sql.placeholder("key"))
  const read = db.select({ value: document.value }).from(document).where(byKey).prepare()
  const remove = db.delete(document).where(byKey).prepare()

  const upsert = db
    .insert(document)
    .values({ key: sql.placeholder("key"), value: sql.placeholder("value") })
    .onConflictDoUpdate({ target: document.key, set: { value: sql.placeholder("value") } })
    .prepare()

  const writer = createWriteBehind<string | null>({
    delay: 500,
    onError: input.onError,
    write: (batch) => {
      const at = Date.now()
      db.transaction(() => {
        for (const [key, value] of batch) {
          if (value === null) {
            remove.run({ key })
            continue
          }

          upsert.run({ key, value })

          
          
          if (json(value))
            db.run(sql`UPDATE ${blobs} SET touched_at = ${at} WHERE ${blobs.id} IN (${referenced(value)})`)
        }
      })

      
      if (!orphans || at - collected < collectInterval) return
      collectBlobs(db, at - blobGrace)
      collected = at
      orphans = false
    },
  })

  return {
    get(key: string) {
      if (writer.has(key)) return writer.get(key) ?? null

      return read.get({ key })?.value ?? null
    },
    
    
    
    set(key: string, value: string | null, strict = false) {
      const missing =
        value === null || !json(value)
          ? []
          : db
              .all<{
                id: string
              }>(sql`SELECT ref.id FROM (${referenced(value)}) AS ref WHERE ref.id NOT IN (SELECT ${blobs.id} FROM ${blobs})`)
              .map((row) => row.id)

      if (!strict || missing.length === 0) writer.set(key, value)

      return missing
    },
    putBlob(data: Uint8Array) {
      const id = createHash("sha256").update(data).digest("hex")
      const touched_at = Date.now()
      db.insert(blobs)
        .values({ id, data: Buffer.from(data), touched_at })
        .onConflictDoUpdate({ target: blobs.id, set: { touched_at } })
        .run()
      orphans = true

      return id
    },
    getBlob(id: string): Uint8Array<ArrayBuffer> | null {
      const data = db.select({ data: blobs.data }).from(blobs).where(eq(blobs.id, id)).get()?.data

      
      return data ? (data as Uint8Array<ArrayBuffer>) : null
    },
    flush: writer.flush,
    close() {
      clearTimeout(startup)
      writer.close()
    },
  }
}

function json(value: string) {
  return value.startsWith("{") || value.startsWith("[")
}


function collectBlobs(db: Database, before: number) {
  db.run(sql`
    DELETE FROM ${blobs}
    WHERE ${blobs.touched_at} < ${before === Infinity ? Number.MAX_SAFE_INTEGER : before}
      AND ${blobs.id} NOT IN (
        SELECT json_extract(node.value, '$.id')
        FROM ${document}, json_tree(${document.value}) AS node
        WHERE json_valid(${document.value}) AND node.key = 'blob' AND node.type = 'object'
          AND json_type(node.value, '$.id') = 'text'
        UNION
        SELECT chunk.value
        FROM ${document}, json_tree(${document.value}) AS node, json_each(node.value, '$.ids') AS chunk
        WHERE json_valid(${document.value}) AND node.key = 'blob' AND node.type = 'object'
          AND json_type(node.value, '$.ids') = 'array'
      )
  `)
}

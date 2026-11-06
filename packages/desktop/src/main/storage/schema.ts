import { blob, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"


export const document = sqliteTable("document", {
  key: text().primaryKey(),
  value: text().notNull(),
})



export const blobs = sqliteTable("blob", {
  id: text().primaryKey(),
  data: blob({ mode: "buffer" }).notNull(),
  touched_at: integer().notNull().default(0),
})




export const state = sqliteTable(
  "state",
  {
    name: text().notNull(),
    key: text().notNull(),
    value: text().notNull(),
    updated_at: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.name, table.key] })],
)



export const extension = sqliteTable("extension", {
  id: text().primaryKey(),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
  manifest: text(),
  revision: text(),
})


export const extensionFile = sqliteTable(
  "extension_file",
  {
    extension_id: text().notNull(),
    path: text().notNull(),
    data: blob({ mode: "buffer" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.extension_id, table.path] })],
)

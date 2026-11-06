import type { DatabaseSync } from "node:sqlite"
import type { EnableState } from "@chassis/gui-extensions/sdk/bridge"


export function readEnableState(db: DatabaseSync): readonly EnableState[] {
  return db.prepare("SELECT id, enabled FROM extension").all().map((row) => {
    
    const id = row.id as string

    return { id, enabled: row.enabled === 1 }
  })
}

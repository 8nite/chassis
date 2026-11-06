export * as SessionAffinity from "./affinity.js"

import type { SessionSchema } from "./schema.js"



export const get = (session: Pick<SessionSchema.Info, "id" | "parentID" | "fork">) =>
  session.parentID ?? session.fork?.sessionID ?? session.id

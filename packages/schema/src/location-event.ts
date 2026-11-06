export * as LocationEvent from "./location-event.js"

import { ephemeral, inventory } from "./event.js"


export const Shutdown = ephemeral({ type: "location.shutdown", schema: {} })

export const Definitions = inventory(Shutdown)

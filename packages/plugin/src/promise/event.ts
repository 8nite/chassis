import type { EventApi } from "@chassis/client/promise/api"

export interface EventDomain extends Pick<EventApi, "subscribe"> {}

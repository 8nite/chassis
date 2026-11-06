import type { EventApi } from "@chassis/client/effect/api"

export interface EventDomain extends Pick<EventApi<unknown>, "subscribe"> {}

import type { ChassisEvent } from "@chassis/client"
import { useClient } from "./client"

type EventMetadata = {
  directory: string | undefined
}
type ChassisEventMap = { [Type in ChassisEvent["type"]]: Extract<ChassisEvent, { type: Type }> }

export function useEvent() {
  const client = useClient()

  function subscribe(handler: (event: ChassisEvent, metadata: EventMetadata) => void) {
    return client.event.listen(({ details }) => {
      if (details.type === "server.connected") return
      handler(details, { directory: details.location?.directory })
    })
  }

  function on<T extends ChassisEvent["type"]>(
    type: T,
    handler: (event: ChassisEventMap[T], metadata: EventMetadata) => void,
  ) {
    return client.event.on(type, (event) => {
      handler(event, { directory: event.location?.directory })
    })
  }

  return {
    subscribe,
    on,
  }
}

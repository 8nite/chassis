import { makeDefaultApi } from "@chassis/protocol/api"
import { LocationMiddleware } from "./location"
import { FormLocationMiddleware } from "./middleware/form-location"
import { SessionLocationMiddleware } from "./middleware/session-location"

export const Api = makeDefaultApi({
  locationMiddleware: LocationMiddleware,
  
  
  formLocationMiddleware: FormLocationMiddleware,
  sessionLocationMiddleware: SessionLocationMiddleware,
})

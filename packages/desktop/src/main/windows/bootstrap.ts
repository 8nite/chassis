import { app } from "electron"
import { Predicate } from "effect"
import { windowBootstrapArgument, type WindowBootstrap } from "../../shared/window-bootstrap"
import { FIRST_LAUNCH_ONBOARDING_COMPLETE_KEY } from "../storage/keys"
import { getStore } from "../storage/store"




export function windowBootstrap(id: string): WindowBootstrap {
  const complete = getStore().get(FIRST_LAUNCH_ONBOARDING_COMPLETE_KEY)

  return {
    id,
    firstLaunchPending: Predicate.isBoolean(complete) ? !complete : undefined,
    packaged: app.isPackaged,
  }
}

export function windowArguments(id: string) {
  return [windowBootstrapArgument(windowBootstrap(id))]
}

import { registerCustomTheme } from "@pierre/diffs"
import { ChassisTheme } from "./marked-theme"

let registered = false

export function registerChassisTheme() {
  if (registered) return
  registered = true
  registerCustomTheme("Chassis", () => Promise.resolve(ChassisTheme))
}

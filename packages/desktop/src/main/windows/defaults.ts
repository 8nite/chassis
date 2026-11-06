import { resolveThemeVariant } from "@chassis/ui/theme/resolve"
import type { DesktopTheme } from "@chassis/ui/theme/types"
import { nativeTheme } from "electron"
import oc2ThemeJson from "../../../../ui/src/theme/themes/oc-2.json"
import { BACKGROUND_COLOR_KEY } from "../storage/keys"
import { getStore } from "../storage/store"




const oc2Theme = oc2ThemeJson as DesktopTheme


export const titlebarHeight = 44

export function tone() {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light"
}




export function storedBackgroundColor() {
  const stored = getStore().get(BACKGROUND_COLOR_KEY)

  if (typeof stored === "string") return stored
  const dark = tone() === "dark"

  return resolveThemeVariant(dark ? oc2Theme.dark : oc2Theme.light, dark)["background-base"]
}

export function titlebarOverlay(mode: "light" | "dark" = tone(), zoom = 1) {
  return {
    color: "#00000000",
    symbolColor: mode === "dark" ? "white" : "black",
    height: Math.max(titlebarHeight, Math.round(titlebarHeight * zoom)),
  }
}
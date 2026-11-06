import { expect, test } from "bun:test"
import { selectTheme, selectThemeMode, supportsThemeMode, themeModes } from "@chassis/theme/tui"
import { getChassisTheme } from "../../../src/theme"

test("selects complete light and dark themes independently", () => {
  const light = selectTheme(getChassisTheme(), "light")
  const dark = selectTheme(getChassisTheme(), "dark")
  expect(selectTheme(getChassisTheme())).toEqual(light)
  expect(light.hue).toEqual(getChassisTheme().light.hue)
  expect(dark.text).toEqual(getChassisTheme().base.text)
  expect(dark.hue).toEqual(getChassisTheme().dark.hue)
  expect(selectThemeMode(getChassisTheme(), "dark")).toEqual({ theme: dark, mode: "dark" })
})

test("selects the available mode when the requested mode is missing", () => {
  const lightOnly = { base: getChassisTheme().base, light: getChassisTheme().light } as const
  const darkOnly = { base: getChassisTheme().base, dark: getChassisTheme().dark } as const

  expect(themeModes(lightOnly)).toEqual(["light"])
  expect(themeModes(darkOnly)).toEqual(["dark"])
  expect(supportsThemeMode(lightOnly, "light")).toBeTrue()
  expect(supportsThemeMode(lightOnly, "dark")).toBeFalse()
  expect(selectThemeMode(lightOnly, "dark")).toEqual({ theme: selectTheme(getChassisTheme(), "light"), mode: "light" })
  expect(selectThemeMode(darkOnly, "light")).toEqual({ theme: selectTheme(getChassisTheme(), "dark"), mode: "dark" })
})

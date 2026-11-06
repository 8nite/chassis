import { loadLocaleDict, normalizeLocale, type Locale, type Platform } from "@chassis/app/desktop"
import { storedLocaleValue } from "./locale-value"





const cacheKey = "chassis.desktop.language"

export async function preloadStoredLocale(platform: Platform) {
  const fresh = Promise.resolve(platform.storage?.("chassis.global.dat").getItem("language")).then(
    (raw) => {
      localStorage.setItem(cacheKey, raw ?? "")

      return raw
    },
    () => undefined,
  )

  const cached = localStorage.getItem(cacheKey)
  const locale = storedLocale(cached ?? (await fresh))

  if (!locale) return

  if (locale !== "en") await loadLocaleDict(locale)

  return locale
}

export function storedLocale(raw: string | null | undefined): Locale | undefined {
  const locale = storedLocaleValue(raw)

  if (!locale) return

  return normalizeLocale(locale)
}

import { isFallbackTitle } from "@chassis/util/session-title-fallback"


export function sessionTabTitle(title: string | undefined, fallback: string) {
  return !title || isFallbackTitle(title) ? fallback : title
}

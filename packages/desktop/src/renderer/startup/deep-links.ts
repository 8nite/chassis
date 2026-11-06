import type { ElectronAPI } from "../api-types"

const deepLinkEvent = "chassis:deep-link"

export function startDeepLinks(api: ElectronAPI) {
  void api.consumeInitialDeepLinks().then(emitDeepLinks)
  api.onDeepLink(emitDeepLinks)
}

function emitDeepLinks(urls: string[]) {
  if (urls.length === 0) return
  window.__CHASSIS__ ??= {}
  window.__CHASSIS__.deepLinks = [...(window.__CHASSIS__.deepLinks ?? []), ...urls]
  window.dispatchEvent(new CustomEvent(deepLinkEvent, { detail: { urls } }))
}

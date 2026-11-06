import type { UpdaterState } from "./contract"


export function updaterAction(state: UpdaterState | undefined) {
  if (!state) return { label: "action.checkNow" as const }

  switch (state.status) {
    case "checking":
      return { label: "action.checking" as const }
    case "downloading":
      return { label: "action.downloading" as const }
    case "ready":
      return { label: "action.installRestart" as const, run: "install" as const }
    case "download-required":
      return { label: "action.download" as const, run: "install" as const }
    case "installing":
      return { label: "action.installing" as const }
    case "disabled":
      return { label: "action.checkNow" as const }
    default:
      return { label: "action.checkNow" as const, run: "check" as const }
  }
}

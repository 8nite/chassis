import type { ServerState } from "../sdk"
import type { SshConfig, SshItem } from "./contract"

export function sshHostname(target: string) {
  
  
  return (
    (target.trim().split(/\s+/).at(-1) ?? "")
      .replace(/["'\\]/g, "")
      .split("@")
      .at(-1) ?? ""
  )
}

export function sshName(config: Pick<SshConfig, "name" | "target">) {
  return config.name || sshHostname(config.target)
}

export function isSshConnecting(stage: SshItem["stage"]) {
  return (
    stage === "connecting" ||
    stage === "checking" ||
    stage === "downloading" ||
    stage === "uploading" ||
    stage === "starting"
  )
}


export function sshServerState(item: SshItem): ServerState {
  if (isSshConnecting(item.stage) || item.authenticatingElsewhere) return "starting"

  if (item.stage === "authentication") return "auth"

  if (item.stage === "ready" || item.stage === "failed" || item.stage === "incompatible") return item.stage

  return "stopped"
}

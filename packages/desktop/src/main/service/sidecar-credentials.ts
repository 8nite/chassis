export * as SidecarCredentials from "./sidecar-credentials"

import type { ServerReadyData } from "../../shared/ipc-contract"

export type Data = ServerReadyData & { password: string | null }




let current: Data | undefined

export function set(data: Data) {
  current = data
}

export function get() {
  return current
}


export function ready(data: Data): ServerReadyData {
  return { url: data.url }
}


export function authorization(sidecar: Data | undefined, url: string) {
  if (!sidecar?.password || !URL.canParse(url)) return

  if (new URL(url).origin !== sidecar.url) return

  return `Basic ${Buffer.from(`chassis:${sidecar.password}`).toString("base64")}`
}

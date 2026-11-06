import { readFileSync } from "node:fs"
import path from "node:path"
import { app } from "electron"
import type { Endpoint } from "@chassis/client/service"






let probe: Promise<Endpoint | undefined> | undefined

export function startSidecarProbe() {
  if (!app.isPackaged) return
  const version = bundledVersion()

  if (!version) return
  probe = import("@chassis/client/service")
    .then(({ Service }) => Service.discover({ version }))
    .catch(() => undefined)
}

export function sidecarProbe() {
  return probe ?? Promise.resolve(undefined)
}

function bundledVersion() {
  try {
    return readFileSync(path.join(process.resourcesPath, "chassis-cli.version"), "utf8").trim()
  } catch {
    return ""
  }
}

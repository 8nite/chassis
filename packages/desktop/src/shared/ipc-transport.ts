import type { EnableState } from "@chassis/gui-extensions/sdk/bridge"

export const IpcTransportPort = "desktop-rpc-port"

export const DragCancelEvent = "chassis:drag-cancel"

export const WindowSnapshotChannel = "desktop-window-snapshot"






export function omitUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitUndefined)

  if (typeof value !== "object" || value === null || value instanceof Uint8Array) return value

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => (item === undefined ? [] : [[key, omitUndefined(item)]])),
  )
}


export type StorageSnapshot = Record<string, { items: Record<string, string>; revision: number }>


export type WindowSnapshot = {
  storage: StorageSnapshot
  extensions?: readonly EnableState[]
}




export function storageSnapshotNames(windowID: string) {
  return ["chassis.global.dat", "default.dat", windowDataFile(windowID)]
}

export function windowDataFile(id: string) {
  return `chassis.window.${id.replace(/[^a-zA-Z0-9._-]/g, "-")}.dat`
}

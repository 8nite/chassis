import { app, ipcMain } from "electron"
import { WindowSnapshotChannel, type WindowSnapshot } from "../../shared/ipc-transport"
import { isRendererUrl } from "../windows/scheme"
import { readWindowSnapshot } from "./window-snapshot"




type Provider = (names: ReadonlyArray<string>) => WindowSnapshot

let provider: Provider = (names) => readWindowSnapshot(app.getPath("userData"), names)

export function setStorageSnapshotProvider(next: Provider) {
  provider = next
}

export function registerStorageSnapshotHandler() {
  
  
  ipcMain.handle(WindowSnapshotChannel, (event, names: unknown): WindowSnapshot => {
    if (!isRendererUrl(event.senderFrame?.url)) return { storage: {} }

    
    
    if (!Array.isArray(names) || !names.every((name) => typeof name === "string")) return { storage: {} }

    return provider(names)
  })
}

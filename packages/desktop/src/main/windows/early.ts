import { randomUUID } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { app, BrowserWindow, screen, shell } from "electron"
import { resolveExternalURL } from "../files/external-url"
import { windowArguments } from "./bootstrap"
import { WINDOW_IDS_KEY } from "../storage/keys"
import { getStore } from "../storage/store"
import { storedBackgroundColor, titlebarOverlay } from "./defaults"
import { registerRendererProtocol } from "./protocol"
import { loadWindow } from "./scheme"
import { allowRendererPermissions, wireNavigationPolicy, wireRendererHeaders } from "./security"
import { manageWindowState, readWindowState, resolveWindowState, windowStateFile, type WindowState } from "./window-state"

export type EarlyWindow = {
  id: string
  win: BrowserWindow
  state: WindowState
  shownAt: number
  
  openExternal: (url: string) => void
}

let pending: EarlyWindow | undefined

const displays = {
  all: () => screen.getAllDisplays().map((display) => display.bounds),
  primary: () => screen.getPrimaryDisplay().bounds,
  matching: (bounds: Electron.Rectangle) => screen.getDisplayMatching(bounds).bounds,
}





export function createEarlyWindow() {
  const ids = getStore().get(WINDOW_IDS_KEY)
  const id = Array.isArray(ids) && typeof ids[0] === "string" ? ids[0] : randomUUID()
  const root = path.dirname(fileURLToPath(import.meta.url))
  const file = path.join(app.getPath("userData"), windowStateFile(id))
  const state = resolveWindowState(readWindowState(file), { width: 1280, height: 800 }, displays)
  const icons = app.isPackaged ? path.join(process.resourcesPath, "icons") : path.join(root, "../../resources/icons")

  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    show: true,
    autoHideMenuBar: true,
    title: "Chassis",
    icon: path.join(icons, `icon.${process.platform === "win32" ? "ico" : "png"}`),
    backgroundColor: storedBackgroundColor(),
    ...(process.platform === "darwin" ? { titleBarStyle: "hidden" as const, trafficLightPosition: { x: 14, y: 14 } } : {}),
    ...(process.platform === "win32" ? { frame: false, titleBarStyle: "hidden" as const, titleBarOverlay: titlebarOverlay() } : {}),
    webPreferences: {
      preload: path.join(root, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: windowArguments(id),
    },
  })

  manageWindowState(win, file, state, displays)
  
  win.once("closed", () => {
    if (pending?.win !== win) return
    pending = undefined
    app.quit()
  })

  const record: EarlyWindow = {
    id,
    win,
    state,
    shownAt: Date.now(),
    openExternal: (url) => {
      const target = resolveExternalURL(url)

      if (target) void shell.openExternal(target)
    },
  }

  pending = record
  
  
  registerRendererProtocol(path.join(root, "../renderer"))
  allowRendererPermissions(win)
  wireNavigationPolicy(win, (url) => record.openExternal(url))
  wireRendererHeaders(win)
  loadWindow(win, "index.html")
}

export function takeEarlyWindow() {
  const taken = pending
  pending = undefined

  return taken
}

import { createSimpleContext } from "@chassis/ui/context"
import type { AsyncStorage, SyncStorage } from "@solid-primitives/storage"
import type { Accessor } from "solid-js"
import type { DesktopMenuAction } from "@/shell/commands/desktop-menu"
import type { DraftStore } from "@/runtime/persistence/drafts"
import type { Bridge } from "@chassis/gui-extensions/sdk/bridge"

type PickerPaths = string | string[] | null

type OpenDirectoryPickerOptions = { title?: string; multiple?: boolean }

type OpenAttachmentPickerOptions = {
  title?: string
  multiple?: boolean
  accept?: string[]
  extensions?: string[]
  defaultPath?: string
}

type SaveFilePickerOptions = { title?: string; defaultPath?: string }

type PlatformName = "web" | "desktop"

type DesktopOS = "macos" | "windows" | "linux"

export type FatalRendererErrorLog = {
  error: string
  url: string
  version?: string
  platform: PlatformName
  os?: DesktopOS
}

type PlatformBase = {
  
  version?: string

  
  openExternal(url: string): void

  
  openBrowser?(url: string): Promise<boolean>

  
  openPath?(path: string, app?: string): Promise<void>

  
  openLocalFile?(url: string): void

  
  revealPath?(path: string): Promise<boolean>

  
  restart(): Promise<void>

  
  notify(title: string, description?: string, onClick?: () => void): Promise<void>

  
  openAttachmentPickerDialog?<Value>(
    opts: OpenAttachmentPickerOptions,
    onFile: (file: File) => Promise<Value>,
  ): Promise<void>

  
  getPathForFile?(file: File): string

  
  onDragCancel?(callback: () => void): () => void

  
  saveFile?(opts: SaveFilePickerOptions, content: string): Promise<boolean>

  
  storage?: (name?: string) => SyncStorage | AsyncStorage

  
  draftStore?: DraftStore

  
  fetch?: typeof fetch

  
  webviewZoom?: Accessor<number>

  
  windowFullscreen?: Accessor<boolean>

  
  getPinchZoomEnabled?(): Promise<boolean> | boolean

  
  setPinchZoomEnabled?(enabled: boolean): Promise<void> | void

  
  runDesktopMenuAction?(action: DesktopMenuAction): Promise<void> | void

  
  checkAppExists?(appName: string): Promise<boolean>

  
  readClipboardImage?(): Promise<File | null>

  
  writeClipboardText?(text: string): Promise<void>

  
  exportDebugLogs?(): Promise<string>

  
  setForceFocus?(enabled: boolean): Promise<void>

  
  recordFatalRendererError?(error: FatalRendererErrorLog): Promise<void>

  
  extensions?: Bridge
}

export type Platform = PlatformBase &
  (
    | { platform: "web"; os?: never; windowID?: never }
    | {
        platform: "desktop"
        os?: DesktopOS
        
        windowID: string
        openDirectoryPickerDialog(opts?: OpenDirectoryPickerOptions): Promise<PickerPaths>
      }
  )

export const { use: usePlatform, provider: PlatformProvider } = createSimpleContext({
  name: "Platform",
  init: (props: { value: Platform }) => {
    return props.value
  },
})

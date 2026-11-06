import { createContext, useContext, type Accessor } from "solid-js"
import type { Browser } from "../browser/contract"
import type { Changes } from "../review/contract"
import type { LineRange, Live, MountedSession, OpenOptions } from "../sdk"
import type { OpenApp } from "./apps"

export type TreeTab = "changes" | "all"


export interface OpenRequest {
  app(): OpenApp | undefined
  set(app: OpenApp | undefined): void
}


export interface FileShared {
  readonly changes: Accessor<Live<Changes>>
  readonly browser: Accessor<Live<Browser>>
  readonly tree: {
    tab(): TreeTab
    setTab(tab: TreeTab): void
    
    directory?: string
  }
  
  readonly filter: {
    element?: HTMLInputElement
    pending?: boolean
    get(session: string): string
    set(session: string, value: string): void
    browsing(session: string): boolean
    setBrowsing(session: string, value: boolean): void
  }
  
  readonly installed: Map<string, Promise<boolean>>
  
  readonly app?: { current(): OpenApp; set(app: OpenApp): void }
  
  readonly request: OpenRequest
  
  readonly handoff: {
    get(session: string, path: string): LineRange | null | undefined
    set(session: string, files: Record<string, LineRange | null>): void
  }
  
  readonly reveal: {
    register(session: string, path: string, run: () => void): () => void
    run(session: string, path: string): void
  }
  
  active(session: MountedSession, id: string): boolean
  open(session: MountedSession, path: string, options?: OpenOptions): void
}

export const FileContext = createContext<FileShared>()

export function useShared() {
  const value = useContext(FileContext)

  if (!value) throw new Error("File views render inside the file extension")

  return value
}


export function current<T>(live: Live<T>) {
  return live.status === "active" ? live.value : undefined
}

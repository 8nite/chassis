import { Contract, type SessionRef } from "../sdk"

export interface Browser {
  
  attached(session: SessionRef): boolean
  
  canOpen(session: SessionRef, path?: string): boolean
  
  open(session: SessionRef, url: string): void
  
  openFile(session: SessionRef, path: string): void
}


export const Browser = Contract.define<Browser, "browser">("browser")

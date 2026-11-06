

import type { Definition } from "./core"


export interface EnableState {
  
  readonly id: string
  
  readonly enabled: boolean
}


export function extensionEnabled(definition: Pick<Definition, "id" | "legacy">, state: readonly EnableState[]) {
  const row = [definition.id, ...(definition.legacy ?? [])]
    .map((id) => state.find((item) => item.id === id))
    .find((item) => item !== undefined)

  return row?.enabled ?? true
}


export interface BridgeLayout {
  
  readonly visible: boolean
  
  readonly bounds?: {
    
    readonly x: number
    
    readonly y: number
    
    readonly width: number
    
    readonly height: number
  }
  
  readonly viewport?: {
    
    readonly width: number
    
    readonly height: number
  }
  
  readonly background?: readonly [number, number, number, number]
  
  readonly radius?: number
  
  readonly border?: {
    
    readonly color: readonly [number, number, number, number]
    
    readonly width: number
  }
}


export interface Installed {
  
  readonly id: string
  
  readonly name: string
  
  readonly version: string
  
  readonly builtin: boolean
  
  readonly enabled: boolean
  
  readonly revision?: string
  
  readonly error?: string
}


export type BridgeMessage =
  | {
      
      readonly type: "state"
      
      readonly ipc: string
      
      readonly state: unknown
    }
  | {
      
      readonly type: "event"
      
      readonly ipc: string
      
      readonly name: string
      
      readonly data: unknown
    }
  | {
      
      readonly type: "available"
      
      readonly ipc: string
      
      readonly available: boolean
    }
  | {
      
      readonly type: "extensions"
      
      readonly list: readonly Installed[]
    }
  | {
      
      readonly type: "menubarItems"
      
      readonly items: readonly BridgeMenubarItem[]
    }


export interface BridgeMenubarItem {
  
  readonly menu: string
  
  readonly id: string
  
  readonly label: string
  
  readonly after?: string
  
  readonly enabled: boolean
}


export interface Bridge {
  
  readonly packaged: boolean
  
  
  
  call(
    input: {
      
      readonly ipc: string
      
      readonly method: string
      
      readonly input: unknown
    },
    signal?: AbortSignal,
  ): Promise<unknown>
  
  
  subscribe(ipc: string): Promise<{
    
    readonly available: boolean
    
    readonly state?: unknown
  }>
  
  on(listener: (message: BridgeMessage) => void): () => void
  
  embed(id: string, layout?: BridgeLayout): void
  
  capture(id: string): Promise<Uint8Array | undefined>
  
  runMenubarItem(id: string): void
  
  configure(
    servers: readonly {
      
      readonly id: string
      
      readonly url: string
      
      readonly username?: string
      
      readonly password?: string
    }[],
  ): void
  
  readonly manager: {
    
    readonly initial?: Promise<readonly EnableState[] | undefined>
    
    list(): Promise<readonly Installed[]>
    
    enable(id: string): Promise<void>
    
    disable(id: string): Promise<void>
    
    reload(id: string): Promise<void>
    
    install(source: Uint8Array | string): Promise<void>
    
    remove(id: string): Promise<void>
    
    source(id: string): Promise<string>
    
    asset(id: string, path: string): string
  }
}

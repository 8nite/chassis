
export type Endpoint = {
  
  readonly url: string
  
  readonly auth?: {
    
    readonly type: "basic"
    
    readonly username: string
    
    readonly password: string
  }
}


export type DiscoverOptions = {
  
  readonly file?: string
  
  readonly version?: string | ((version: string) => boolean)
}


export type EnsureReason = "missing" | "version-mismatch"


export type EnsureOptions = DiscoverOptions & {
  
  readonly command?: ReadonlyArray<string>
  
  readonly env?: Readonly<Record<string, string>>
  
  readonly onStart?: (reason: EnsureReason, previousVersion?: string) => void
}


export type StopOptions = {
  
  readonly file?: string
  
  readonly pty?: "clear" | "handoff"
}


export type Info = {
  
  readonly id?: string
  
  readonly version?: string
  
  readonly url: string
  
  readonly pid: number
  
  readonly password?: string
}

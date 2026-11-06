import type { Data } from "@chassis/client/solid"
import type { LocationRef, ChassisClient, ProjectListOutput, WorktreeDirectory } from "@chassis/client/promise"
import type { Schema } from "effect"
import type { JSX } from "solid-js"
import type { Store } from "solid-js/store"
import type { Cleanup, OS, Persisted, StoreFrom } from "./core"
import type { IconName, Link } from "./registries"


export interface ServerRef {
  
  readonly id: string
  
  readonly name: string
  
  readonly url: string
  
  readonly password?: string
  
  readonly client: ChassisClient
  
  readonly data: Data
  
  readonly local: boolean
  
  readonly builtin: boolean
  
  readonly compatible: boolean
  
  readonly connected: boolean
}


export interface SessionRef {
  
  readonly key: string
  
  readonly id: string
  
  readonly tab: string
  
  readonly server: ServerRef
  
  readonly pending: boolean
  
  readonly location: LocationRef | undefined
}


export type Project = Omit<ProjectListOutput[number], "canonical"> & {
  
  worktree: string
  
  worktrees: WorktreeDirectory[]
}


export type FileContent = {
  
  type: "text" | "binary"
  
  content: string
  
  diff?: string
  
  patch?: {
    
    oldFileName: string
    
    newFileName: string
    
    oldHeader?: string
    
    newHeader?: string
    
    hunks: Array<{
      
      oldStart: number
      
      oldLines: number
      
      newStart: number
      
      newLines: number
      
      lines: string[]
    }>
    
    index?: string
  }
  
  encoding?: "base64"
  
  mimeType?: string
  
  size?: number
}


export interface LineRange {
  
  start: number
  
  end: number
  
  side?: "additions" | "deletions"
  
  endSide?: "additions" | "deletions"
}


export interface FileState {
  
  path: string
  
  name: string
  
  loaded?: boolean
  
  loading?: boolean
  
  notFound?: boolean
  
  error?: string
  
  content?: FileContent
}


export interface FileNode {
  
  name: string
  
  path: string
  
  absolute: string
  
  type: "file" | "directory"
  
  ignored: boolean
}


export interface Files {
  
  readonly root: string
  
  ready(): boolean
  
  resolve(path: string): string
  
  absolute(path: string): boolean
  
  get(path: string): FileState | undefined
  
  missing(path: string): boolean
  
  sync(
    path: string,
    options?: {
      
      readonly force?: boolean
    },
  ): Promise<void>
  
  exists(path: string): Promise<boolean>
  
  search(
    query: string,
    options?: {
      
      readonly kind?: "file" | "any"
      
      readonly limit?: number
      
      readonly signal?: AbortSignal
    },
  ): Promise<string[]>
  
  readonly selection: {
    
    get(path: string): LineRange | null | undefined
    
    set(path: string, range: LineRange | null): void
  }
  
  readonly scroll: {
    
    get(path: string): {
      
      readonly top?: number
      
      readonly left?: number
    }
    
    set(
      path: string,
      value: {
        
        readonly top?: number
        
        readonly left?: number
      },
    ): void
  }
  
  readonly tree: {
    
    list(path: string): readonly FileNode[]
    
    state(path: string):
      | {
          
          expanded: boolean
          
          loaded?: boolean
          
          loading?: boolean
          
          error?: string
        }
      | undefined
    
    sync(
      path: string,
      options?: {
        
        readonly force?: boolean
      },
    ): Promise<void>
    
    expand(
      path: string,
      options?: {
        
        readonly list?: boolean
      },
    ): void
    
    collapse(path: string): void
  }
}


export interface Comment {
  
  id: string
  
  time: number
  
  file: string
  
  selection: LineRange
  
  comment: string
}


export interface Comments {
  
  list(file?: string): readonly Comment[]
  
  add(input: Omit<Comment, "id" | "time">): Comment
  
  update(id: string, comment: string): void
  
  remove(id: string): void
  
  readonly focus: {
    
    current(): {
      
      readonly file: string
      
      readonly id: string
    } | null
    
    set(
      value: {
        
        readonly file: string
        
        readonly id: string
      } | null,
    ): void
  }
  
  readonly active: {
    
    current(): {
      
      readonly file: string
      
      readonly id: string
    } | null
    
    set(
      value: {
        
        readonly file: string
        
        readonly id: string
      } | null,
    ): void
  }
}


export interface ComposerFile {
  
  type: "file"
  
  path: string
  
  selection?: {
    
    startLine: number
    
    endLine: number
    
    startChar: number
    
    endChar: number
  }
  
  preview?: string
  
  comment?: string
  
  commentID?: string
  
  commentOrigin?: "review" | "file"
}


export interface ComposerNote {
  
  type: "note"
  
  origin: string
  
  commentID: string
  
  label: string
  
  icon: IconName
  
  subject: string
  
  comment: string
  
  href?: string
  
  live?: {
    
    readonly subject: string
    
    readonly href?: string
  }
}


export interface Composer {
  
  attach(part: ComposerFile | ComposerNote): void
  
  update(
    id: string,
    patch: {
      
      readonly comment?: string
      
      readonly preview?: string
    },
  ): void
  
  detach(id: string): void
}


export interface BackgroundTask {
  
  id: string
  
  type: "shell" | "subagent"
  
  label: string
  
  agent?: string
}


export interface MountedSession extends SessionRef {
  
  readonly visit: object
  
  readonly project: Project | undefined
  
  readonly listedProject:
    | {
        
        readonly worktree: string
        
        readonly name?: string
        
        readonly icon?: Project["icon"]
      }
    | undefined
  
  readonly directory: string
  
  readonly local: boolean
  
  readonly background: readonly BackgroundTask[]
}


export interface SessionScreen {
  
  readonly file: Files
  
  readonly comment: Comments
  
  readonly composer: Composer
}


export interface Screen {
  
  current(): SessionScreen | undefined
}


export interface Sessions {
  
  list(): readonly SessionRef[]
  
  current(): MountedSession | undefined
}


export type PanelState = "closed" | "open" | "active" | "visible"


export interface OpenOptions {
  
  readonly tab?: "open" | "preview" | "append" | "select"
  
  readonly background?: boolean
}


export interface Layout {
  
  narrow(): boolean
  
  ready(): boolean
  
  open(key: string, session: SessionRef, options?: OpenOptions): void
  
  close(key: string, session: SessionRef): void
  
  toggle(key: string, session: SessionRef): void
  
  state(key: string, session: SessionRef): PanelState
  
  stored(session: SessionRef): readonly string[]
  
  readonly side: {
    
    opened(session: SessionRef): boolean
    
    toggle(session: SessionRef): void
  }
  
  readonly sidebar: {
    
    opened(): boolean
  }
  
  readonly dock: {
    
    opened(session: SessionRef): boolean
    
    placement(): "side" | "bottom"
  }
  
  readonly scroll: {
    
    get(
      session: SessionRef,
      key: string,
    ):
      | {
          
          readonly x: number
          
          readonly y: number
        }
      | undefined
    
    set(
      session: SessionRef,
      key: string,
      value: {
        
        readonly x: number
        
        readonly y: number
      },
    ): void
  }
  
  settings(page?: string): void
  
  project(server: string, title: string): void
}


export type StorageScope =
  | "global"
  | {
      
      readonly server: string
      
      readonly directory?: string
    }
  | {
      
      readonly session: SessionRef
    }


export interface StoreOptions<S extends Schema.ConstraintCodec<object, unknown>> {
  
  readonly schema: S
  
  readonly initial: S["Type"]
  
  readonly scope?: StorageScope
  
  readonly from?: StoreFrom | readonly StoreFrom[]
}


export interface Storage {
  
  store<S extends Schema.ConstraintCodec<object, unknown>>(key: string, options: StoreOptions<S>): Persisted<S["Type"]>
  
  memory<T extends object>(
    key: string,
    options: {
      
      readonly initial: T
    },
  ): readonly [Store<T>, (mutation: (draft: T) => void) => void]
  
  remove(
    key: string,
    options?: {
      
      readonly scope?: StorageScope
      
      readonly from?: StoreFrom | readonly StoreFrom[]
    },
  ): void
}


export interface System {
  
  copy(text: string): Promise<void>
  
  save(file: {
    
    readonly name: string
    
    readonly content: string
  }): Promise<boolean>
  
  openExternal(url: string): void
}


export interface Desktop {
  
  readonly os: OS
  
  readonly window: string
  
  zoom(): number
  
  launch(path: string, app?: string): Promise<void>
  
  forceFocus(enabled: boolean): Promise<void>
  
  reveal(path: string): Promise<boolean>
  
  installed(app: string): Promise<boolean>
}


export interface Locale {
  
  locale(): string
  
  direction(): "ltr" | "rtl"
  
  setDirection(direction: "ltr" | "rtl"): void
}


export interface Appearance {
  
  font(kind: "mono"): string
}


export interface Router {
  
  routing(): boolean
  
  path(): string
}


export interface Keybinds {
  
  keybind(command: string): readonly string[]
  
  keys(bind: string): readonly string[]
  
  matches(command: string, event: KeyboardEvent): boolean
}


export interface Servers {
  
  list(): readonly string[]
  
  get(id: string): ServerRef | undefined
}


export interface Workspaces {
  
  on(
    event: "remove",
    handler: (value: {
      
      readonly server: string
      
      readonly directory: string
    }) => void,
  ): Cleanup
}


export interface Links {
  
  open(link: Link): boolean
  
  exists(link: Link): boolean | Promise<boolean>
}


export interface DialogHandle {
  
  close(): void
}


export interface Dialogs {
  
  open(
    render: (dialog: DialogHandle) => JSX.Element,
    options?: {
      
      readonly replace?: boolean
    },
  ): DialogHandle
  
  active(): boolean
}


export interface EmbedProps {
  
  readonly id: string | undefined
  
  readonly visible: boolean
  
  readonly frozen?: boolean
  
  readonly radius?: number
  
  readonly background?: string
  
  readonly class?: string
  
  readonly children?: JSX.Element
}


export interface Embeds {
  
  View(props: EmbedProps): JSX.Element
  
  capture(id: string): Promise<Uint8Array | undefined>
}

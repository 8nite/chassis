import type {
  AgentInfo,
  CommandInfo,
  SessionFormCancelInput,
  FormInfo,
  SessionFormReplyInput,
  IntegrationInfo,
  LocationRef,
  McpResource,
  McpServer,
  ModelInfo,
  ChassisClient,
  ChassisEvent,
  PermissionSavedInfo,
  PermissionRequest,
  Project,
  ProviderInfo,
  ReferenceInfo,
  SessionInfo,
  SessionMessageInfo,
  SessionInboxInfo,
  ShellInfo,
  SkillInfo,
  VcsInfo,
} from "@chassis/client"
import type { ResolvedTheme } from "@chassis/theme/tui"
import type { CliRenderer, KeyEvent, MarkdownCodeBlockRenderer, Renderable } from "@opentui/core"
import type { JSX } from "@opentui/solid"
import type { Store } from "solid-js/store"

export interface Storage {
  
  store<Value extends object>(
    key: string,
    options: {
      readonly initial: Value
    },
  ): readonly [Store<Value>, (mutation: (draft: Value) => void) => Promise<void>]
  
  memory<Value extends object>(
    key: string,
    options: {
      readonly initial: Value
    },
  ): readonly [Store<Value>, (mutation: (draft: Value) => void) => void]
}

interface LocationCollection<Value> {
  list(location?: LocationRef): Value[] | undefined
  sync(location?: LocationRef): Promise<void>
  invalidate(location?: LocationRef): void
}

type ChassisEventMap = { [Type in ChassisEvent["type"]]: Extract<ChassisEvent, { type: Type }> }

export interface Data {
  readonly on: <Type extends ChassisEvent["type"]>(
    type: Type,
    handler: (event: ChassisEventMap[Type]) => void,
  ) => () => void
  readonly listen: (handler: (event: { details: ChassisEvent }) => void) => () => void
  readonly session: {
    list(): SessionInfo[]
    get(sessionID: string): SessionInfo | undefined
    root(sessionID: string): string
    family(sessionID: string): string[]
    cost(sessionID: string): number
    status(sessionID: string): "idle" | "running"
    readonly pending: {
      list(sessionID: string): SessionInboxInfo[]
      sync(sessionID: string): Promise<void>
      invalidate(sessionID: string): void
    }
    sync(sessionID: string): Promise<void>
    invalidate(sessionID: string): void
    readonly message: {
      list(sessionID: string): SessionMessageInfo[]
      get(sessionID: string, messageID: string): SessionMessageInfo | undefined
      sync(sessionID: string): Promise<void>
      invalidate(sessionID: string): void
    }
    readonly permission: {
      list(sessionID: string): PermissionRequest[] | undefined
      sync(sessionID: string): Promise<void>
      invalidate(sessionID: string): void
    }
    readonly form: {
      list(sessionID: string, location?: LocationRef): Array<FormInfo & { readonly location?: LocationRef }> | undefined
      sync(sessionID: string, location?: LocationRef): Promise<void>
      invalidate(sessionID: string, location?: LocationRef): void
      reply(input: SessionFormReplyInput, location?: LocationRef): Promise<void>
      cancel(input: SessionFormCancelInput, location?: LocationRef): Promise<void>
    }
  }
  readonly project: {
    list(): Project[]
    get(projectID: string): Project | undefined
    sync(): Promise<void>
    invalidate(): void
    readonly permission: {
      list(projectID: string): PermissionSavedInfo[] | undefined
      sync(projectID: string): Promise<void>
      invalidate(projectID: string): void
    }
  }
  readonly shell: {
    list(location?: LocationRef): ShellInfo[]
    get(id: string): ShellInfo | undefined
    sync(location?: LocationRef): Promise<void>
    invalidate(location?: LocationRef): void
  }
  readonly location: {
    default(): LocationRef
    sync(location?: LocationRef): Promise<void>
    invalidate(location?: LocationRef): void
    readonly vcs: {
      info(location?: LocationRef): VcsInfo | undefined
      sync(location?: LocationRef): Promise<void>
      invalidate(location?: LocationRef): void
    }
    readonly agent: LocationCollection<AgentInfo>
    readonly command: LocationCollection<CommandInfo>
    readonly integration: LocationCollection<IntegrationInfo>
    readonly mcp: {
      readonly server: LocationCollection<McpServer>
      readonly resource: LocationCollection<McpResource>
    }
    readonly model: LocationCollection<ModelInfo>
    readonly provider: LocationCollection<ProviderInfo>
    readonly reference: LocationCollection<ReferenceInfo>
    readonly skill: LocationCollection<SkillInfo>
  }
}

export type Route =
  | { readonly type: "home" }
  | { readonly type: "session"; readonly sessionID: string }
  | {
      readonly type: "plugin"
      readonly id: string
      readonly name: string
      readonly data?: Record<string, any>
    }

export type Destination = Route | Omit<Extract<Route, { readonly type: "plugin" }>, "id">

export interface Page {
  readonly name: string
  readonly render: (input: { readonly data?: Record<string, any> }) => JSX.Element
}

type PromptFooterInput = {
  readonly sessionID?: string
  readonly mode: "normal" | "shell"
  readonly showDetails: boolean
}

export type PanelPresentation = "panel" | "fullscreen"


export interface PanelInput {
  
  readonly name: string
  readonly sessionID: string
  readonly width: number
  readonly presentation: PanelPresentation
  readonly focused: boolean
  readonly focus: () => void
  readonly close: () => void
  readonly toggleFullscreen: () => void
}


export interface SlotMap {
  readonly app: Readonly<Record<string, never>>
  readonly "home.footer": Readonly<Record<string, never>>
  readonly "home.footer.status": Readonly<Record<string, never>>
  readonly "prompt.footer": PromptFooterInput
  readonly "prompt.footer.status": PromptFooterInput
  readonly "prompt.footer.file": PromptFooterInput
  readonly "session.composer.top": { readonly sessionID: string }
  readonly "session.panel": PanelInput
  readonly "sidebar.content": { readonly sessionID: string }
  readonly "sidebar.footer": { readonly sessionID: string }
}
export type SlotPath = keyof SlotMap


export type SlotClaim<Path extends SlotPath = SlotPath> = Path extends SlotPath
  ? { readonly render: (input: SlotMap[Path]) => JSX.Element } & (
      | {
          readonly prepend: Path
          readonly append?: never
          readonly before?: never
          readonly after?: never
          readonly replace?: never
        }
      | {
          readonly append: Path
          readonly prepend?: never
          readonly before?: never
          readonly after?: never
          readonly replace?: never
        }
      | {
          readonly before: Path
          readonly prepend?: never
          readonly append?: never
          readonly after?: never
          readonly replace?: never
        }
      | {
          readonly after: Path
          readonly prepend?: never
          readonly append?: never
          readonly before?: never
          readonly replace?: never
        }
      | {
          readonly replace: Path
          readonly prepend?: never
          readonly append?: never
          readonly before?: never
          readonly after?: never
        }
    )
  : never

export interface App {
  readonly version: string
  readonly channel: string
}

export type ToastVariant = "info" | "success" | "warning" | "error"

export interface ToastOptions {
  readonly title?: string
  readonly message: string
  readonly variant?: ToastVariant
  readonly duration?: number
  
  readonly sessionID?: string
}

export interface Toast {
  show(options: ToastOptions): void
}

export type AttentionWhen = "always" | "focused" | "blurred"
export type AttentionSoundName = "default" | "question" | "permission" | "error" | "done" | "subagent_done"

export type AttentionNotification =
  | boolean
  | {
      readonly when?: AttentionWhen
    }

export type AttentionSound =
  | boolean
  | {
      readonly name?: AttentionSoundName
      readonly volume?: number
      readonly when?: AttentionWhen
    }

export interface AttentionNotifyOptions {
  readonly title?: string
  readonly message: string
  readonly notification?: AttentionNotification
  readonly sound?: AttentionSound
}

export type AttentionNotifySkipReason =
  | "attention_disabled"
  | "empty_message"
  | "blurred"
  | "focused"
  | "focus_unknown"
  | "renderer_destroyed"

export interface AttentionNotifyResult {
  readonly ok: boolean
  readonly notification: boolean
  readonly sound: boolean
  readonly skipped?: AttentionNotifySkipReason
}

export interface Attention {
  notify(options: AttentionNotifyOptions): Promise<AttentionNotifyResult>
}

export type DialogSize = "medium" | "large" | "xlarge"

export interface DialogOptions {
  readonly size?: DialogSize
  readonly centered?: boolean
}

export interface DialogAlertOptions {
  readonly title: string
  readonly message: string
}

export interface DialogConfirmOptions {
  readonly title: string
  readonly message: string
  readonly label?: {
    readonly confirm?: string
    readonly cancel?: string
  }
}

export interface DialogPromptOptions {
  readonly title: string
  readonly description?: string
  readonly placeholder?: string
  readonly value?: string
}

export interface DialogSelectOption<Value> {
  readonly title: string
  readonly value: Value
  readonly description?: string
  readonly footer?: string
  readonly category?: string
  readonly disabled?: boolean
}

export type DialogSelectAction<Value> = {
  readonly bind: string
  readonly title: string
  readonly side?: "left" | "right"
} & (
  | {
      
      readonly selection?: "required"
      readonly onTrigger: (value: Value) => void
    }
  | {
      readonly selection: "none"
      readonly onTrigger: () => void
    }
)

export interface DialogSelectOptions<Value> {
  readonly title: string
  readonly placeholder?: string
  readonly options: readonly DialogSelectOption<Value>[]
  readonly current?: Value
  
  readonly search?: (
    query: string,
    options: readonly DialogSelectOption<Value>[],
  ) => readonly DialogSelectOption<Value>[]
  
  readonly actions?: readonly DialogSelectAction<Value>[]
}

export interface Dialog {
  
  show(render: () => JSX.Element, onClose?: () => void): void
  
  set(options: DialogOptions): void
  
  clear(): void
  alert(options: DialogAlertOptions): Promise<void>
  confirm(options: DialogConfirmOptions): Promise<boolean | undefined>
  prompt(options: DialogPromptOptions): Promise<string | undefined>
  select<Value>(options: DialogSelectOptions<Value>): Promise<Value | undefined>
}

export interface KeymapCommand {
  
  readonly id?: string
  
  readonly title?: string
  
  readonly description?: string
  
  readonly group?: string
  
  readonly enabled?: boolean | (() => boolean)
  
  readonly bind?: false | string
  
  readonly palette?: true
  
  readonly slash?: {
    readonly name: string
    readonly aliases?: string[]
    
    readonly arguments?: true
  }
  
  readonly suggested?: boolean | (() => boolean)
  
  readonly run: (input?: string, event?: KeyEvent) => void | false | Promise<void>
}

export interface KeymapLayer {
  
  readonly mode?: string
  
  readonly enabled?: boolean | (() => boolean)
  
  readonly target?: () => Renderable | null | undefined
  
  readonly priority?: number
  
  readonly commands?: readonly KeymapCommand[]
  
  readonly bindings?: readonly string[]
}

export interface KeymapPending {
  readonly key: string
  readonly token?: string
}

export interface KeymapActive {
  readonly key: string
  readonly title?: string
  readonly description?: string
  readonly group?: string
  readonly continues: boolean
}

export interface Keymap {
  
  layer(factory: () => KeymapLayer): void
  
  dispatch(id: string, input?: string): void
  
  shortcuts(id: string): readonly string[]
  
  commands(): readonly KeymapCommand[]
  
  pending(): readonly KeymapPending[]
  
  active(): readonly KeymapActive[]
  
  readonly mode: {
    
    current(): string
    
    push(mode: string): () => void
  }
}

export interface UI {
  readonly dialog: Dialog
  readonly toast: Toast
  readonly format: {
    path(value: string): string
  }
  readonly router: {
    register(page: Page): () => void
    navigate(destination: Destination): void
    current(): Route
  }
  readonly panel: {
    
    open(name: string, options?: { readonly presentation?: PanelPresentation }): boolean
    
    close(): void
    
    current(): { readonly name: string; readonly sessionID: string } | undefined
  }
  readonly tabs: {
    
    enabled(): boolean
    
    list(): readonly {
      readonly sessionID: string
      readonly title?: string
      readonly active: boolean
      readonly busy: boolean
      readonly attention: boolean
      readonly unread?: "activity" | "error"
    }[]
    
    open(sessionID: string): boolean
    
    focus(sessionID: string): boolean
    
    move(sessionID: string, index: number): boolean
    
    close(sessionID?: string): boolean
  }
  readonly model: {
    
    current(): { readonly providerID: string; readonly modelID: string; readonly variant?: string } | undefined
    readonly variant: {
      
      list(): readonly string[]
      
      set(variant: string | undefined): boolean
    }
  }
  
  readonly slot: (claim: SlotClaim) => () => void
}

export interface Context {
  readonly options: Readonly<Record<string, any>>
  readonly location: LocationRef | undefined
  readonly app: App
  readonly renderer: CliRenderer
  readonly client: ChassisClient
  readonly data: Data
  readonly attention: Attention
  readonly theme: ResolvedTheme
  readonly themeMode: "dark" | "light"
  readonly markdown: {
    registerCodeBlockRenderer(language: string, render: MarkdownCodeBlockRenderer): () => void
  }
  readonly keymap: Keymap
  readonly storage: Storage
  readonly ui: UI
}

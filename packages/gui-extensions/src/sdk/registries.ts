import type { JSX } from "solid-js"
import type { IconName } from "@chassis/ui/icons/catalog"
import { Registry } from "./core"
import type { SessionRef, MountedSession, SessionScreen } from "./host-apis"


export type { IconName }


export interface Command {
  
  readonly id: string
  
  readonly title: string
  
  readonly description?: string
  
  readonly group?: string
  
  readonly section?: "general" | "session" | "navigation" | "model" | "terminal" | "prompt"
  
  readonly bind?: string
  
  readonly slash?: {
    
    readonly name: string
    
    readonly arguments?: true
    
    readonly after?: string
  }
  
  readonly hidden?: true
  
  readonly suggested?: boolean
  
  readonly featured?: true
  
  readonly enabled?: boolean
  
  readonly scope?: string
  
  readonly editable?: true
  
  run(input?: string): void | Promise<void>
}


interface MenuItemBase {
  
  readonly id: string
  
  readonly title: string
  
  readonly order?: number
}


export interface SessionPanelMenuItem extends MenuItemBase {
  
  readonly menu: "session.panel"
  
  readonly icon?: IconName
  
  readonly keybind?: string
  
  run(): void
}


export interface ServerAddMenuItem extends MenuItemBase {
  
  readonly menu: "server.add"
  
  run(): void
}


export interface ServerRowMenuItem extends MenuItemBase {
  
  readonly menu: "server.row"
  
  readonly when?: (server: string) => boolean
  
  readonly enabled?: (server: string) => boolean
  
  run(server: string): void
}


export type MenuItem = SessionPanelMenuItem | ServerAddMenuItem | ServerRowMenuItem


export interface PanelTab {
  
  readonly id: string
  
  readonly title: string
  
  readonly label?: (state: {
    
    readonly active: boolean
    
    readonly preview: boolean
    
    readonly session: MountedSession
  }) => JSX.Element
  
  readonly pinned?: boolean
  
  readonly draggable?: boolean
  
  readonly closable?: "compact" | "hover" | false
  
  readonly transient?: boolean
  
  readonly first?: boolean
  
  readonly fallback?: boolean
  
  readonly group?: string
  
  readonly missing?: boolean
  
  readonly hidden?: boolean
  
  readonly file?: string
  
  readonly tabbable?: boolean
  
  readonly dom?: {
    
    readonly tab?: string
    
    readonly panel?: string
  }
}


export interface MobileView {
  
  readonly title: string
  
  readonly order: number
  
  readonly kind: "tab" | "menu" | "drawer"
  
  readonly icon?: IconName
}


export interface PanelProps {
  
  readonly tab: PanelTab
  
  readonly session: MountedSession
  
  readonly screen: SessionScreen
}


export interface Panel {
  
  readonly id: string
  
  readonly region: "side" | "dock"
  
  readonly wide?: boolean
  
  readonly transient?: boolean
  
  readonly legacy?: Readonly<Record<string, string>>
  
  normalize?(input: {
    
    readonly id: string
    
    readonly session: MountedSession
    
    readonly screen: SessionScreen
  }): string
  
  readonly mobile?: MobileView
  
  list(input: {
    
    readonly session: MountedSession
    
    readonly screen: SessionScreen
    
    readonly open: readonly string[]
  }): readonly PanelTab[]
  
  render(props: PanelProps): JSX.Element
  
  close?(input: PanelProps): void
  
  focus?(
    input: PanelProps & {
      
      readonly restored: boolean
    },
  ): void
}


export interface SettingEntry {
  
  readonly id: string
  
  readonly title: string
  
  readonly description?: string
  
  readonly keywords?: string
}


export interface SettingsPage {
  
  readonly id: string
  
  readonly page?: "general" | "servers"
  
  readonly section?: "general"
  
  readonly title: string
  
  readonly icon?: IconName
  
  readonly available?: "desktop" | "mobile"
  
  readonly entries?: readonly SettingEntry[]
  
  render(input: {
    
    readonly target?: string
  }): JSX.Element
}


export type ServerState = "stopped" | "starting" | "auth" | "ready" | "failed" | "incompatible"


export interface ServerHealth {
  
  readonly healthy: boolean
  
  readonly version?: string
  
  readonly incompatible?: boolean
  
  readonly checking?: boolean
}


export interface ServerRow {
  
  readonly key: string
  
  health(): ServerHealth | undefined
  
  readonly Indicator: (props: {
    
    readonly health?: ServerHealth
    
    readonly connecting?: boolean
    
    readonly auth?: boolean
  }) => JSX.Element
  
  remove(): Promise<void>
  
  readonly Items: () => JSX.Element
}


export interface ServerEntry {
  
  readonly id: string
  
  readonly name: string
  
  readonly label?: string
  
  readonly state: ServerState
  
  readonly listed?: boolean
  
  readonly http?: {
    
    readonly url: string
    
    readonly username?: string
    
    readonly password?: string
  }
  
  reconnect?(signal: AbortSignal): Promise<{
    
    readonly url: string
    
    readonly password?: string
  }>
  
  connect?(): Promise<boolean>
  
  remove?(): Promise<void>
  
  row?(row: ServerRow): JSX.Element
  
  cover?(input: {
    
    readonly tab: string
  }): JSX.Element
}


export interface Server {
  
  readonly ready: boolean
  
  readonly order?: number
  
  readonly entries: readonly ServerEntry[]
}


export interface Link {
  
  readonly href: string
  
  readonly origin?: string
  
  readonly exact?: boolean
  
  readonly background?: boolean
  
  readonly base?: string
  
  readonly session?: SessionRef
}


export interface LinkHandler {
  
  readonly priority?: number
  
  match(link: Link): boolean
  
  open(link: Link): void
  
  exists?(link: Link): boolean | Promise<boolean>
}


export interface TitlebarItem {
  
  readonly id: string
  
  readonly placement?: "titlebar" | "channel"
  
  readonly label: string
  
  readonly title?: string
  
  readonly icon?: IconName
  
  readonly busy?: boolean
  
  readonly pressed?: boolean
  
  run?(): void
}


export interface SlotMap {
  
  readonly "window.bottom": Record<string, never>
  
  readonly "session.header": {
    
    readonly screen: SessionScreen
    
    readonly session: MountedSession
    
    readonly active: boolean
  }
  
  readonly "session.panel.end": {
    
    readonly screen: SessionScreen
    
    readonly session: MountedSession
  }
  
  readonly "session.panel.sidebar": {
    
    readonly screen: SessionScreen
    
    readonly session: MountedSession
  }
}


export type Slot = {
  [At in keyof SlotMap]: {
    
    readonly at: At
    
    readonly order?: number
    
    render(input: SlotMap[At]): JSX.Element
  }
}[keyof SlotMap]


export const Command = Registry.define<Command>("command")


export const MenuItem = Registry.define<MenuItem>("menu-item")


export const Panel = Registry.define<Panel>("panel")


export const SettingsPage = Registry.define<SettingsPage>("settings-page")


export const Server = Registry.define<Server>("server")


export const LinkHandler = Registry.define<LinkHandler>("link-handler")


export const TitlebarItem = Registry.define<TitlebarItem>("titlebar-item")


export const Slot = Registry.define<Slot>("slot")


export const Style = Registry.define<string>("style")

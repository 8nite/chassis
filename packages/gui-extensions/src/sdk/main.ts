import type { BrowserWindow, NativeImage, WebContentsView } from "electron"
import type { Schema } from "effect"
import {
  Registry,
  type BaseContext,
  type Build,
  type Cleanup,
  type Declared,
  type DeclaredStores,
  type Definition,
  type Ipc,
  type IpcImpl,
  type IpcProvider,
  type IpcRef,
  type IpcSpec,
  type MainStoreDeclaration,
  type MainStoreFrom,
  type Persisted,
} from "./core"
import type { Scope } from "./scope"

export * from "./core"

export * from "./scope"


export interface Windows {
  
  get(id: number): BrowserWindow | undefined
  
  list(): readonly BrowserWindow[]
  
  focused(): BrowserWindow | undefined
  
  on(event: "open" | "close", handler: (window: BrowserWindow) => void): Cleanup
}


export interface Embed {
  
  readonly id: string
  
  show(visible: boolean): void
  
  on(event: "visible", handler: (visible: boolean) => void): Cleanup
  
  capture(): Promise<NativeImage | undefined>
  
  dispose(): void
}


export interface Embeds {
  
  create(view: WebContentsView, window: BrowserWindow): Embed
}


export interface Storage {
  
  store<S extends Schema.ConstraintCodec<unknown, unknown>>(
    key: string,
    options: {
      
      readonly schema: S
      
      readonly initial: S["Type"]
      
      readonly from?: MainStoreFrom | readonly MainStoreFrom[]
    },
  ): Persisted<S["Type"], S["Type"]>
  
  remove(
    key: string,
    options?: {
      
      readonly from?: MainStoreFrom | readonly MainStoreFrom[]
    },
  ): void
}


export interface ServerEndpoint {
  
  readonly id: string
  
  readonly url: string
  
  readonly headers: Readonly<Record<string, string>>
  
  readonly local: boolean
  
  readonly username?: string
  
  readonly password?: string
}


export interface Cli {
  
  readonly version: string
  
  readonly command: readonly string[]
  
  readonly binary?: string
  
  readonly development: boolean
}


export interface ServerEndpoints {
  
  get(id: string): ServerEndpoint | undefined
}


export interface Lifecycle {
  
  restart(
    handoff?: () => void | Promise<void>,
    options?: {
      
      readonly keep?: Scope
    },
  ): Promise<void>
}


export interface Log {
  
  write<Data extends Readonly<Record<string, unknown>>>(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    data?: Data,
  ): void
}

type MainHandle<S> = S extends MainStoreDeclaration<infer Schema> ? Persisted<Schema["Type"], Schema["Type"]> : never

type MainStores<D> = [D] extends [never]
  ? {}
  : {
      readonly [K in keyof DeclaredStores<D> as DeclaredStores<D>[K] extends MainStoreDeclaration
        ? K
        : never]: MainHandle<DeclaredStores<D>[K]>
    }


type ProvidedSpec<D> = [D] extends [never]
  ? IpcSpec
  : Declared<D, "provides">[keyof Declared<D, "provides">] extends infer T
    ? T extends Ipc<infer S>
      ? S
      : T extends IpcRef<infer S>
        ? S
        : never
    : never


export interface MainContext<D = never> extends BaseContext {
  
  readonly stores: MainStores<D>
  
  readonly scope: Scope
  
  readonly storage: Storage
  
  readonly log: Log
  
  readonly lifecycle: Lifecycle
  
  readonly build: Build
  
  readonly serverEndpoints: ServerEndpoints
  
  readonly windows: Windows
  
  readonly embeds: Embeds
  
  readonly cli: Cli
  
  provide<S extends Extract<ProvidedSpec<D>, IpcSpec>>(token: Ipc<S>, impl: IpcImpl<S>): IpcProvider<S>
}


export type MainSetup<D extends Definition = never> = (ctx: MainContext<D>) => void | Promise<void>


export interface MenubarItem {
  
  readonly menu: "app" | "file" | "edit" | "view" | "go" | "window" | "help"
  
  readonly id: string
  
  readonly label: string
  
  readonly after?: string
  
  readonly enabled?: () => boolean
  
  run(window: BrowserWindow | undefined): void
}


export const MenubarItem = Registry.define<MenubarItem>("menubar-item")

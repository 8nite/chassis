import type { Accessor } from "solid-js"
import type {
  BaseContext,
  Build,
  Cleanup,
  Contract,
  Declared,
  DeclaredStores,
  Definition,
  Ipc,
  IpcClient,
  IpcRef,
  Live,
  MainStoreDeclaration,
  Persisted,
  StoreDeclaration,
  TokenValue,
  Usable,
} from "./core"
import type {
  Appearance,
  Desktop,
  Dialogs,
  Embeds,
  Keybinds,
  Layout,
  Links,
  Locale,
  Router,
  Screen,
  Servers,
  SessionRef,
  Sessions,
  Storage,
  System,
  Workspaces,
} from "./host-apis"


export interface Context extends BaseContext {
  
  readonly signal: AbortSignal
  
  provide<T>(token: Contract<T>, impl: T): Cleanup
  
  readonly layout: Layout
  
  readonly sessions: Sessions
  
  readonly screen: Screen
  
  readonly storage: Storage
  
  readonly system: System
  
  readonly desktop: Desktop | undefined
  
  readonly dialogs: Dialogs
  
  readonly links: Links
  
  readonly embeds: Embeds
  
  readonly build: Build
  
  readonly locale: Locale
  
  readonly appearance: Appearance
  
  readonly router: Router
  
  readonly keybinds: Keybinds
  
  readonly servers: Servers
  
  readonly workspaces: Workspaces
}

type Handle<S> =
  S extends StoreDeclaration<infer Schema, infer Scope>
    ? Scope extends "global"
      ? Persisted<Schema["Type"], Schema["Type"]>
      : (session: SessionRef) => Persisted<Schema["Type"]>
    : never

type Provides<D> = Declared<D, "provides">[keyof Declared<D, "provides">]


type Used<T> =
  T extends IpcRef<infer S>
    ? Accessor<Live<IpcClient<S>>> & {
        
        load(token: Ipc<S>): Accessor<Live<IpcClient<S>>>
      }
    : Accessor<Live<TokenValue<T>>>


export interface SetupContext<D> extends Omit<Context, "provide"> {
  
  provide<T extends Extract<Provides<D>, Contract<unknown>>>(token: T, impl: TokenValue<T>): Cleanup
  
  readonly uses: { readonly [K in keyof Usable<D>]: Used<Usable<D>[K]> }
  
  readonly requires: { readonly [K in keyof Declared<D, "requires">]: TokenValue<Declared<D, "requires">[K]> }
  
  readonly stores: {
    readonly [K in keyof DeclaredStores<D> as DeclaredStores<D>[K] extends MainStoreDeclaration ? never : K]: Handle<
      DeclaredStores<D>[K]
    >
  }
}


export type Setup<D extends Definition> = (ctx: SetupContext<D>) => undefined

import type { Schema } from "effect"
import type { Accessor } from "solid-js"


export type Cleanup = () => void | Promise<void>


export type OS = "macos" | "windows" | "linux"


export type Params = Record<string, string | number | boolean>


export type Messages = Readonly<Record<string, string>>


export type Catalog = {
  
  readonly en: Messages
} & {
  readonly [locale: string]:
    | Messages
    | (() => Promise<{
        
        readonly default: Messages
      }>)
}


type Result = void | Promise<void>


export interface Build {
  
  readonly version: string
  
  readonly channel: "local" | "dev" | "beta" | "prod"
  
  readonly platform: "web" | "desktop"
  
  readonly packaged: boolean
}


export interface Definition {
  
  readonly id: string
  
  readonly legacy?: readonly string[]
  
  readonly os?: readonly OS[]
  
  readonly i18n?: Catalog
  
  readonly provides?: Tokens
  
  readonly uses?: Tokens
  
  readonly requires?: Readonly<Record<string, Contract<unknown> | Ipc>>
  
  readonly stores?: Readonly<Record<string, StoreDeclaration | MainStoreDeclaration>>
  
  readonly renderer?: () => Promise<{
    
    readonly default: (ctx: never) => void
  }>
  
  readonly main?: () => Promise<{
    
    readonly default: (ctx: never) => Result
  }>
}


type Entries = {
  readonly renderer?: () => Promise<object>
  readonly main?: () => Promise<object>
}

declare const brand: unique symbol

declare const problem: unique symbol


export interface Registry<T> {
  
  readonly kind: "registry"
  
  readonly id: string
  
  readonly [brand]?: T
}


export interface Contract<T, Id extends string = string> {
  
  readonly kind: "contract"
  
  readonly id: Id
  
  readonly [brand]?: T
}

type Codec = Schema.ConstraintCodec<unknown, unknown>


export interface IpcMethod {
  
  readonly input?: Codec
  
  readonly output?: Codec
}


export interface IpcSpec {
  
  readonly id: string
  
  readonly state?: Codec
  
  readonly methods: Readonly<Record<string, IpcMethod>>
  
  readonly events?: Readonly<Record<string, Codec>>
}


export interface Ipc<S extends IpcSpec = IpcSpec> {
  
  readonly kind: "ipc"
  
  readonly id: string
  
  readonly spec: S
}


export interface IpcRef<S extends IpcSpec = IpcSpec> {
  
  readonly kind: "ipc"
  
  readonly id: string
  
  readonly spec?: undefined
  
  readonly [brand]?: S
}


export type Token = Contract<unknown> | Ipc | IpcRef


export type Tokens = Readonly<Record<string, Token>>

type TypeOf<C> = C extends Codec ? C["Type"] : void


export type IpcClient<S extends IpcSpec> = {
  readonly [Name in keyof S["methods"]]: S["methods"][Name] extends { readonly input: Codec }
    ? (
        
        input: TypeOf<S["methods"][Name]["input"]>,
        
        options?: IpcCallOptions,
      ) => Promise<TypeOf<S["methods"][Name]["output"]>>
    : (
        
        options?: IpcCallOptions,
      ) => Promise<TypeOf<S["methods"][Name]["output"]>>
} & {
  
  state(): TypeOf<S["state"]> | undefined
  
  on<Name extends keyof NonNullable<S["events"]> & string>(
    name: Name,
    listener: (data: TypeOf<NonNullable<S["events"]>[Name]>) => void,
  ): Cleanup
}


export interface IpcCallOptions {
  
  readonly signal?: AbortSignal
}


export type TokenValue<T> =
  T extends Ipc<infer S>
    ? IpcClient<S>
    : T extends IpcRef<infer S>
      ? IpcClient<S>
      : T extends Contract<infer V>
        ? V
        : never


export type Live<T> =
  | {
      
      readonly status: "pending"
    }
  | {
      
      readonly status: "active"
      
      readonly value: T
      
      readonly generation: number
    }
  | {
      
      readonly status: "inactive"
      
      readonly reason: "disabled" | "failed" | "blocked" | "restarting"
    }

const live = Symbol.for("chassis.extension.live")


export const Live = {
  
  accessor: <T>(read: () => Live<T>): Accessor<Live<T>> => Object.assign(read, { [live]: true }),
  
  is: (source: Accessor<unknown>): source is Accessor<Live<unknown>> => live in source,
}


export interface Caller {
  
  readonly window: number
  
  readonly signal: AbortSignal
}


export type IpcImpl<S extends IpcSpec> = {
  readonly [Name in keyof S["methods"]]: (
    input: TypeOf<S["methods"][Name]["input"]>,
    caller: Caller,
  ) => TypeOf<S["methods"][Name]["output"]> | Promise<TypeOf<S["methods"][Name]["output"]>>
} & (S["state"] extends Codec
  ? {
      
      state(window: number): TypeOf<S["state"]>
    }
  : unknown)


export interface IpcProvider<S extends IpcSpec> {
  
  changed(window?: number): void
  
  emit<Name extends keyof NonNullable<S["events"]> & string>(
    name: Name,
    data: TypeOf<NonNullable<S["events"]>[Name]>,
    window?: number,
  ): void
  
  dispose(): void
}


export interface BaseContext {
  
  readonly id: string
  
  add<T>(registry: Registry<T>, item: T | (() => T | undefined)): Cleanup
  
  list<T>(registry: Registry<T>): readonly T[]
  
  t(key: string, params?: Params): string
  
  plural(key: string, count: number, params?: Params): string
}


export type StoreFrom =
  | string
  | {
      
      readonly key: string
      
      readonly sessions?: string
      
      
      
      pick(value: unknown): unknown
    }

type StoreSchema = Schema.ConstraintCodec<object, unknown>


export interface StoreDeclaration<
  S extends StoreSchema = StoreSchema,
  Scope extends "global" | "session" = "global" | "session",
> {
  
  readonly scope: Scope
  
  readonly schema: S
  
  readonly initial: S["Type"]
  
  readonly from?: StoreFrom | readonly StoreFrom[]
}


export type MainStoreFrom =
  | {
      
      readonly settings: string
      
      readonly file?: string
    }
  | {
      
      readonly state: readonly [namespace: string, key: string]
    }

type MainSchema = Schema.ConstraintCodec<unknown, unknown>


export interface MainStoreDeclaration<S extends MainSchema = MainSchema> {
  
  readonly scope: "main"
  
  readonly schema: S
  
  readonly initial: S["Type"]
  
  readonly from?: MainStoreFrom | readonly MainStoreFrom[]
}


export const Store = {
  
  global: <S extends StoreSchema>(
    schema: S,
    initial: NoInfer<S["Type"]>,
    from?: StoreFrom | readonly StoreFrom[],
  ): StoreDeclaration<S, "global"> => ({
    scope: "global",
    schema,
    initial,
    from,
  }),
  
  session: <S extends StoreSchema>(
    schema: S,
    initial: NoInfer<S["Type"]>,
    from?: StoreFrom | readonly StoreFrom[],
  ): StoreDeclaration<S, "session"> => ({ scope: "session", schema, initial, from }),
  
  main: <S extends MainSchema>(
    schema: S,
    initial: NoInfer<S["Type"]>,
    from?: MainStoreFrom | readonly MainStoreFrom[],
  ): MainStoreDeclaration<S> => ({ scope: "main", schema, initial, from }),
}


export interface Persisted<T, V = T | undefined> {
  
  readonly value: V
  
  ready(): boolean
  
  update(
    mutate: (
      
      draft: Mutable<T>,
    ) => undefined,
  ): void
  
  set(next: T): void
}


export type Mutable<T> = T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T


export type Declared<D, K extends "provides" | "uses" | "requires"> = D extends { readonly [P in K]?: infer M }
  ? M extends Tokens
    ? M
    : {}
  : {}


export type DeclaredStores<D> = D extends { readonly stores?: infer M }
  ? M extends Readonly<Record<string, StoreDeclaration | MainStoreDeclaration>>
    ? M
    : {}
  : {}


export type TokenId<T> =
  T extends Ipc<infer S>
    ? S["id"]
    : T extends IpcRef<infer S>
      ? S["id"]
      : T extends Contract<unknown, infer Id>
        ? Id
        : never


export interface Missing<Id extends string> {
  
  readonly [problem]: Id
}


export interface Duplicate<Id extends string> {
  
  readonly [problem]: Id
}


export interface DuplicateExtension<Id extends string> {
  
  readonly [problem]: Id
}


export interface MissingMain<Id extends string> {
  
  readonly [problem]: Id
}


export interface Conflict<Key extends string> {
  
  readonly [problem]: Key
}

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

type SharedKeys<D> = keyof Declared<D, "provides"> & keyof Declared<D, "uses"> & string

type ConflictingKeys<D> = {
  [K in SharedKeys<D>]: Same<Declared<D, "provides">[K], Declared<D, "uses">[K]> extends true ? never : K
}[SharedKeys<D>]


export type DefinitionCheck<D> = [ConflictingKeys<D>] extends [never]
  ? unknown
  : {
      
      readonly "conflicting key": Conflict<ConflictingKeys<D>>
    }


export type Usable<D> = Omit<Declared<D, "provides">, keyof Declared<D, "uses">> & Declared<D, "uses">

type Literal<Id> = Id extends string ? (string extends Id ? never : Id) : never


type Ids<D, K extends "provides" | "uses" | "requires"> = D extends unknown
  ? TokenId<Declared<D, K>[keyof Declared<D, K>]>
  : never

type Others<Ds extends readonly unknown[], I> = { [J in keyof Ds]: J extends I ? never : Ds[J] }[number]

type MissingIds<Ds extends readonly unknown[]> = Exclude<Ids<Ds[number], "requires">, Ids<Ds[number], "provides">>

type DuplicateIds<Ds extends readonly unknown[]> = {
  [I in keyof Ds]: Literal<Ids<Ds[I], "provides">> & Ids<Others<Ds, I>, "provides">
}[number]

type ExtensionId<D> = D extends { readonly id: infer Id } ? Literal<Id> : never

type DuplicateExtensions<Ds extends readonly unknown[]> = {
  [I in keyof Ds]: ExtensionId<Ds[I]> & ExtensionId<Others<Ds, I>>
}[number]


export type Composition<Ds extends readonly unknown[]> = [DuplicateExtensions<Ds>] extends [never]
  ? ProvidersCheck<Ds>
  : {
      
      readonly "duplicate extension": DuplicateExtension<DuplicateExtensions<Ds>>
    }

type ProvidersCheck<Ds extends readonly unknown[]> = [MissingIds<Ds>] extends [never]
  ? [DuplicateIds<Ds>] extends [never]
    ? unknown
    : {
        
        readonly "duplicate provider": Duplicate<DuplicateIds<Ds>>
      }
  : {
      
      readonly "missing provider": Missing<MissingIds<Ds>>
    }

type IpcIds<D, K extends "provides" | "uses" | "requires"> = D extends unknown
  ? TokenId<Extract<Declared<D, K>[keyof Declared<D, K>], Ipc | IpcRef>>
  : never


type MissingIpcs<R extends readonly unknown[], M extends readonly unknown[]> = Exclude<
  IpcIds<R[number], "provides"> | IpcIds<R[number], "uses"> | IpcIds<R[number], "requires">,
  IpcIds<Extract<M[number], { readonly main: unknown }>, "provides">
>


export type IpcsProvided<R extends readonly unknown[], M extends readonly unknown[]> = [MissingIpcs<R, M>] extends [
  never,
]
  ? true
  : MissingMain<MissingIpcs<R, M>>


export const Extension = {
  
  define: <const D extends Omit<Definition, "renderer" | "main"> & Entries>(definition: D & DefinitionCheck<D>): D =>
    definition,
  
  compose: <const Ds extends readonly Definition[]>(...definitions: Ds & Composition<Ds>): Ds => definitions,
}


export const Registry = {
  
  define: <T>(id: string): Registry<T> => ({ kind: "registry", id }),
}


export const Contract = {
  
  define: <T, const Id extends string>(id: Id): Contract<T, Id> => ({ kind: "contract", id }),
}

type SpecOf<R> = R extends Ipc<infer S> ? S : never


export const Ipc = {
  
  define: <const S extends IpcSpec>(spec: S): Ipc<S> => ({ kind: "ipc", id: spec.id, spec }),
  
  ref: <R extends Ipc>(id: TokenId<R>): IpcRef<SpecOf<R>> => ({ kind: "ipc", id }),
}

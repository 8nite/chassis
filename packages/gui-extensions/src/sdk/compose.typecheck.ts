

import type { Accessor } from "solid-js"
import { Schema } from "effect"
import {
  Extension,
  bindExtension,
  Ipc,
  Contract,
  Store,
  type Composition,
  type Conflict,
  type DefinitionCheck,
  type Desktop,
  type Duplicate,
  type DuplicateExtension,
  type IpcClient,
  type Live,
  type Missing,
  type MissingMain,
  type IpcsProvided,
  type SessionScreen,
  type MountedSession,
  type Panel,
  type PanelProps,
  type PanelTab,
  type SlotMap,
  type IconName,
  type Setup,
} from "./index"
import type { MainSetup } from "./main"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

const equal = <A, B>(value: Equal<A, B>) => value

const Tree = Contract.define<{ open(path: string): void }, "fixture.tree">("fixture.tree")

const Changes = Contract.define<{ count(): number }, "fixture.changes">("fixture.changes")

const Pane = Ipc.define({ id: "fixture.pane", methods: { open: { input: Schema.String } } })

const View = Schema.Struct({ open: Schema.Boolean })

const TreeProvider = Extension.define({ id: "tree", provides: { tree: Tree } })

const PaneProvider = Extension.define({ id: "pane", provides: { pane: Pane } })

const Consumer = Extension.define({
  id: "consumer",
  uses: { changes: Changes },
  requires: { tree: Tree, pane: Pane },
  stores: { view: Store.global(View, { open: false }), draft: Store.session(View, { open: true }) },
})


export const renderer = Extension.compose(TreeProvider, PaneProvider, Consumer)

equal<typeof renderer, readonly [typeof TreeProvider, typeof PaneProvider, typeof Consumer]>(true)



Extension.compose(PaneProvider, Consumer)

equal<Composition<[typeof PaneProvider, typeof Consumer]>, { readonly "missing provider": Missing<"fixture.tree"> }>(
  true,
)


const SameId = Extension.define({ id: "tree" })


Extension.compose(TreeProvider, SameId)

equal<
  Composition<[typeof TreeProvider, typeof SameId]>,
  { readonly "duplicate extension": DuplicateExtension<"tree"> }
>(true)


const Second = Extension.define({ id: "second", provides: { tree: Tree } })


Extension.compose(TreeProvider, Second, PaneProvider, Consumer)

equal<
  Composition<[typeof TreeProvider, typeof Second, typeof PaneProvider, typeof Consumer]>,
  { readonly "duplicate provider": Duplicate<"fixture.tree"> }
>(true)


export const main = Extension.compose({ ...PaneProvider, main: async () => ({ default: () => undefined }) })

export const ipcs: IpcsProvided<typeof renderer, typeof main> = true

export const mainless = Extension.compose(PaneProvider)


export const unprovided: IpcsProvided<typeof renderer, typeof mainless> = true

equal<IpcsProvided<typeof renderer, typeof mainless>, MissingMain<"fixture.pane">>(true)


const PaneRef = Ipc.ref<typeof Pane>("fixture.pane")

const RefConsumer = Extension.define({ id: "ref", uses: { pane: PaneRef } })

export const referenced: IpcsProvided<[typeof RefConsumer], typeof main> = true

export const resolver: Setup<typeof RefConsumer> = (ctx) => {
  const full = ctx.uses.pane.load(Pane)
  equal<typeof full, Accessor<Live<IpcClient<(typeof Pane)["spec"]>>>>(true)
  
  ctx.uses.pane.load(Ipc.define({ id: "fixture.other", methods: {} }))
  
  Ipc.ref<typeof Pane>("fixture.other")
}


Extension.define({ id: "held", requires: { pane: PaneRef } })


export const setup: Setup<typeof Consumer> = (ctx) => {
  equal<typeof ctx.uses.changes, Accessor<Live<{ count(): number }>>>(true)
  ctx.requires.tree.open("a.ts")
  void ctx.requires.pane.open("https://example.com")
  equal<typeof ctx.stores.view.value, { readonly open: boolean }>(true)
  equal<ReturnType<typeof ctx.stores.draft>["value"], { readonly open: boolean } | undefined>(true)
  
  equal<typeof ctx.desktop, Desktop | undefined>(true)
  
  void ctx.use
  
  void ctx.uses.unlisted
  
  void ctx.uses.tree
  
  ctx.provide(Tree, { open: () => undefined })
  
  void ctx.stores.missing
  
  const session = ctx.sessions.current()
  
  void session?.file
  
  void session?.comment
  
  void session?.composer
  equal<ReturnType<typeof ctx.screen.current>, SessionScreen | undefined>(true)
  
  void ctx.screen.current()?.session
  ctx.stores.view.update((draft) => {
    draft.open = true
  })
  ctx.stores.view.set({ open: false })
  
  ctx.stores.view.update(() => ({ open: true }))
  
  ctx.stores.view.set({ open: "wrong" })
}

equal<ReturnType<Setup<typeof Consumer>>, undefined>(true)


export const asyncSetup: Setup<typeof Consumer> = async () => {}


export const returningSetup: Setup<typeof Consumer> = () => ({ open: true })

equal<ReturnType<MainSetup<typeof Consumer>>, void | Promise<void>>(true)

equal<PanelProps["screen"], SessionScreen>(true)

equal<Parameters<Panel["list"]>[0]["session"], MountedSession>(true)

equal<Parameters<Panel["list"]>[0]["screen"], SessionScreen>(true)

equal<Parameters<NonNullable<Panel["focus"]>>[0]["restored"], boolean>(true)

equal<Parameters<NonNullable<Panel["normalize"]>>[0]["screen"], SessionScreen>(true)

equal<Parameters<NonNullable<Panel["close"]>>[0], PanelProps>(true)

equal<SlotMap["session.header"]["screen"], SessionScreen>(true)

equal<SlotMap["session.panel.end"]["screen"], SessionScreen>(true)

equal<SlotMap["session.panel.sidebar"]["screen"], SessionScreen>(true)

equal<SlotMap["window.bottom"]["screen"], never>(true)

equal<PanelTab["fallback"], boolean | undefined>(true)

export const ineligible: PanelTab = { id: "details", title: "Details", fallback: false }

equal<Extract<Live<never>, { status: "inactive" }>["reason"], "disabled" | "failed" | "blocked" | "restarting">(true)


export const unknownIcon: IconName = "not-an-icon"

export const bound = bindExtension((props: { readonly label: string }) => props.label)


bound({ wrong: "field" })

const NoInput = Ipc.define({ id: "fixture.no-input", methods: { info: { output: Schema.String } } })

export function noInput(client: IpcClient<typeof NoInput.spec>, signal: AbortSignal) {
  void client.info()
  void client.info({ signal })
  
  void client.info(undefined, { signal })
  
  void client.info({ signal: "wrong" })
}

const Nested = Extension.define({
  id: "nested",
  stores: {
    prefs: Store.global(Schema.Struct({ items: Schema.Array(Schema.Struct({ shown: Schema.Boolean })) }), {
      items: [],
    }),
  },
})

export const nested: Setup<typeof Nested> = (ctx) => {
  ctx.stores.prefs.update((draft) => {
    draft.items.push({ shown: true })
    draft.items[0].shown = false
  })
  
  ctx.stores.prefs.value.items.push({ shown: true })
}

export const provider: Setup<typeof TreeProvider> = (ctx) => {
  ctx.provide(Tree, { open: () => undefined })
  
  ctx.provide(Tree, { close: () => undefined })
  
  equal<typeof ctx.uses.tree, Accessor<Live<{ open(path: string): void }>>>(true)
}

export const ipcProvider: Setup<typeof PaneProvider> = (ctx) => {
  equal<typeof ctx.uses.pane, Accessor<Live<IpcClient<(typeof Pane)["spec"]>>>>(true)
}


export const repeated = Extension.define({ id: "repeated", provides: { tree: Tree }, uses: { tree: Tree } })


Extension.define({ id: "clash", provides: { tree: Tree }, uses: { tree: Changes } })

equal<
  DefinitionCheck<{
    readonly provides: { readonly tree: typeof Tree }
    readonly uses: { readonly tree: typeof Changes }
  }>,
  { readonly "conflicting key": Conflict<"tree"> }
>(true)


const Split = Extension.define({
  id: "split",
  stores: { view: Store.global(View, { open: false }), count: Store.main(Schema.Number, 0) },
})

export const windowStores: Setup<typeof Split> = (ctx) => {
  equal<typeof ctx.stores.view.value, { readonly open: boolean }>(true)
  
  void ctx.stores.count
}

export const mainStores: MainSetup<typeof Split> = (ctx) => {
  equal<typeof ctx.stores.count.value, number>(true)
  
  void ctx.stores.view
  
  void ctx.screen
}



const Other = Ipc.define({ id: "fixture.other", methods: { ping: {} } })

const RefProvider = Extension.define({ id: "refProvider", provides: { pane: PaneRef } })

export const mainProvider: MainSetup<typeof PaneProvider> = (ctx) => {
  ctx.provide(Pane, { open: () => undefined })
  
  ctx.provide(Other, { ping: () => undefined })
}

export const mainRefProvider: MainSetup<typeof RefProvider> = (ctx) => void ctx.provide(Pane, { open: () => undefined })

export const installedProvider: MainSetup = (ctx) => void ctx.provide(Other, { ping: () => undefined })


Store.main(Schema.Number, 0, "settings:count")

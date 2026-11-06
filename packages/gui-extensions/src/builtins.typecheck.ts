



import { Extension, Ipc, type MissingMain, type IpcsProvided } from "./sdk"
import type { builtins } from "./renderer"

import type { builtins as mainBuiltins } from "./main"
import type browser from "./browser"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

const equal = <A, B>(value: Equal<A, B>) => value

export const ipcs: IpcsProvided<typeof builtins, typeof mainBuiltins> = true


type Mainless = readonly (Exclude<(typeof mainBuiltins)[number], { readonly id: "browser" }> | typeof browser)[]


export const mainless: IpcsProvided<typeof builtins, Mainless> = true

equal<IpcsProvided<typeof builtins, Mainless>, MissingMain<"browser.pane">>(true)

const Orphan = Ipc.define({ id: "fixture.orphan", methods: {} })


const Uses = Extension.define({ id: "fixture", uses: { orphan: Orphan } })


export const used: IpcsProvided<readonly [...typeof builtins, typeof Uses], typeof mainBuiltins> = true


const Provider = Extension.define({ id: "fixture.provider", provides: { orphan: Orphan } })

const Requires = Extension.define({ id: "fixture.requires", requires: { orphan: Orphan } })


export const held: IpcsProvided<
  readonly [...typeof builtins, typeof Provider, typeof Requires],
  readonly [...typeof mainBuiltins, typeof Provider]
> = true

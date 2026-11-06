import { createRequire, isBuiltin } from "node:module"
import type { MainSetup } from "@chassis/gui-extensions/sdk/main"
import { Option, Predicate, Schema } from "effect"
import { ExtensionError } from "./error"

const native = createRequire(import.meta.url)



const shared = new Map<string, () => Promise<object>>([
  ["effect", () => import("effect")],
  ["@chassis/gui-extensions/sdk/main", () => import("@chassis/gui-extensions/sdk/main")],
  ["@chassis/schema/rpc", () => import("@chassis/schema/rpc")],
  ["@chassis/client", () => import("@chassis/client")],
  ["@chassis/client/effect", () => import("@chassis/client/effect")],
])


const InlineCatalog = Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.String))


type Module = { exports: { default?: object; i18n?: object } }

export function mainImportAllowed(name: string) {
  return name === "electron" || isBuiltin(name) || shared.has(name)
}


export async function evaluateMain(source: string, imports: readonly string[]) {
  const modules = new Map(
    await Promise.all(
      imports.map(async (name) => {
        if (name === "electron" || isBuiltin(name)) return [name, native(name)] as const
        const load = shared.get(name)

        if (!load) throw new ExtensionError("invalidModule", { message: name })

        return [name, await load()] as const
      }),
    ),
  )

  const module: Module = { exports: {} }

  
  new Function("require", "module", "exports", source)(
    (name: string) => {
      if (!modules.has(name)) throw new ExtensionError("invalidModule", { message: name })

      return modules.get(name)
    },
    module,
    module.exports,
  )
  const setup = module.exports.default
  const i18n = module.exports.i18n

  if (!Predicate.isFunction(setup)) throw new ExtensionError("invalidModule")
  const catalog = i18n === undefined ? undefined : Schema.decodeUnknownOption(InlineCatalog)(i18n)

  if (catalog && Option.isNone(catalog)) throw new ExtensionError("invalidModule", { message: "i18n" })

  
  return { setup: setup as MainSetup, i18n: catalog && { en: {}, ...catalog.value } }
}

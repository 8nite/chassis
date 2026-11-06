import { Schema } from "effect"
import { Extension, Store } from "../sdk"
import { Wsl } from "./contract"
import en from "./i18n/en"


const Saved = Schema.Struct({ servers: Schema.Array(Schema.Unknown) })

export default Extension.define({
  id: "wsl",
  os: ["windows"],
  provides: { wsl: Wsl },
  stores: {
    
    servers: Store.main(Saved, { servers: [] }, { settings: "wslServers" }),
  },
  i18n: {
    en,
  },
})

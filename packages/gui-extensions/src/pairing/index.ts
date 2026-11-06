import { Schema } from "effect"
import { Extension, Store } from "../sdk"
import { Pairing } from "./contract"
import en from "./i18n/en"

export default Extension.define({
  id: "pairing",
  provides: { pairing: Pairing },
  stores: {
    
    keepScreenActive: Store.main(Schema.Boolean, false, { state: ["chassis.settings", "keepScreenActive"] }),
    
    links: Store.global(Schema.Struct({ custom: Schema.String, selected: Schema.String }), { custom: "", selected: "" }),
  },
  i18n: {
    en,
  },
})

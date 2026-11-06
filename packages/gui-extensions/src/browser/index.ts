import { Schema } from "effect"
import { Extension, Ipc, Store } from "../sdk"
import { Browser } from "./contract"
import { History } from "./history"
import en from "./i18n/en"
import type { BrowserPane } from "./ipc"



const Pane = Ipc.ref<typeof BrowserPane>("browser.pane")

export default Extension.define({
  id: "browser",
  provides: { browser: Browser, pane: Pane },
  stores: {
    
    refs: Store.main(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)), 0),
    
    
    history: Store.global(History, { visits: [] }),
  },
  i18n: {
    en,
  },
})

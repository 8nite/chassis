import { Browser } from "@chassis/plugin-browser/rpc"
import { Schema } from "effect"
import { Ipc } from "../sdk"

const text = (maximum: number) => Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(maximum))

const detail = (maximum: number) => Schema.String.check(Schema.isMaxLength(maximum))

const binding = text(128)


export const MAX_ICON_URL = 24_576


export const PaneElement = Schema.Struct({
  ref: Browser.Ref,
  selector: detail(2_048),
  label: detail(512),
  role: Schema.optionalKey(detail(128)),
  name: Schema.optionalKey(detail(512)),
  text: Schema.optionalKey(detail(512)),
  
  rect: Schema.Struct({ x: Schema.Finite, y: Schema.Finite, width: Schema.Finite, height: Schema.Finite }),
})

export type PaneElement = typeof PaneElement.Type

export const PaneEvent = Schema.Union([
  Schema.Struct({ type: Schema.Literal("focus"), tabID: Browser.TabID }),
  Schema.Struct({ type: Schema.Literal("preview"), path: text(2_048) }),
  Schema.Struct({
    type: Schema.Literal("state"),
    state: Schema.NullOr(Browser.State),
    error: Schema.optionalKey(Schema.String),
  }),
  
  Schema.Struct({ type: Schema.Literal("embed"), tabID: Browser.TabID, embed: text(256) }),
  
  Schema.Struct({
    type: Schema.Literal("inspect"),
    tabID: Browser.TabID,
    active: Schema.Boolean,
    element: Schema.optionalKey(PaneElement),
  }),
  
  
  Schema.Struct({
    type: Schema.Literal("page"),
    tabID: Browser.TabID,
    icon: Schema.optionalKey(detail(MAX_ICON_URL).check(Schema.isStartingWith("data:image/"))),
    zoom: Schema.Finite.check(Schema.isBetween({ minimum: 0.25, maximum: 5 })),
  }),
  
  Schema.Struct({ type: Schema.Literal("address"), tabID: Browser.TabID }),
])

export type PaneEvent = typeof PaneEvent.Type


export const BrowserPane = Ipc.define({
  id: "browser.pane",
  methods: {
    register: {
      input: Schema.Struct({
        binding,
        server: text(16_384),
        session: text(256).check(Schema.isStartingWith("ses")),
        restore: Schema.optionalKey(Browser.State),
      }),
    },
    
    load: { input: Schema.Struct({ binding, tabID: Browser.TabID }) },
    command: { input: Schema.Struct({ binding, command: Browser.Action }) },
    
    inspect: { input: Schema.Struct({ binding, tabID: Browser.TabID, enabled: Schema.Boolean }) },
    
    highlight: { input: Schema.Struct({ binding, tabID: Browser.TabID, ref: Schema.optionalKey(Browser.Ref) }) },
    
    zoom: {
      input: Schema.Struct({ binding, tabID: Browser.TabID, zoom: Schema.Literals(["in", "out", "reset"]) }),
    },
    
    
    site: {
      input: Schema.Struct({ binding, tabID: Browser.TabID }),
      output: Schema.Struct({ cookies: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) }),
    },
    
    clearSite: { input: Schema.Struct({ binding, tabID: Browser.TabID }) },
    close: { input: Schema.Struct({ binding }) },
  },
  events: {
    event: Schema.Struct({ binding: Schema.String, event: PaneEvent }),
  },
})

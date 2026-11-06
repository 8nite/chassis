import { Schema } from "effect"
import { Ipc } from "../sdk"

export const UpdaterState = Schema.Union([
  Schema.Struct({ status: Schema.Literal("disabled") }),
  Schema.Struct({ status: Schema.Literal("idle") }),
  Schema.Struct({ status: Schema.Literal("checking") }),
  Schema.Struct({ status: Schema.Literal("downloading"), version: Schema.String }),
  Schema.Struct({ status: Schema.Literal("ready"), version: Schema.String }),
  Schema.Struct({ status: Schema.Literal("download-required"), version: Schema.String }),
  Schema.Struct({ status: Schema.Literal("up-to-date") }),
  Schema.Struct({ status: Schema.Literal("installing"), version: Schema.String }),
  Schema.Struct({ status: Schema.Literal("error"), message: Schema.String }),
])

export type UpdaterState = typeof UpdaterState.Type


export const Updater = Ipc.define({
  id: "updater",
  state: UpdaterState,
  methods: {
    check: { output: UpdaterState },
    
    install: {},
  },
  events: {
    
    check: Schema.Null,
  },
})

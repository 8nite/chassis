import { Schema } from "effect"
import { Extension, Store } from "../sdk"
import { Updater } from "./contract"
import en from "./i18n/en"

const ReleaseNotes = Schema.Struct({ enabled: Schema.Boolean })

const Seen = Schema.Struct({ version: Schema.optional(Schema.String) })

export default Extension.define({
  id: "updater",
  provides: { updater: Updater },
  stores: {
    
    releaseNotes: Store.global(
      ReleaseNotes,
      { enabled: true },
      {
        key: "settings.v3",
        pick: (value: { general?: { releaseNotes?: unknown } } | null) => {
          const enabled = value?.general?.releaseNotes

          return enabled === undefined ? undefined : { enabled }
        },
      },
    ),
    
    seen: Store.global(Seen, {}, "highlights.v1"),
    
    ready: Store.main(Schema.NullOr(Schema.Struct({ version: Schema.String })), null, {
      settings: "ready",
      file: "chassis.updater",
    }),
  },
  i18n: {
    en,
  },
})

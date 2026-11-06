import { Schema } from "effect"
import { FileTree, OpenInApp } from "../file/contract"
import { Extension, Store } from "../sdk"
import { Changes } from "./contract"
import en from "./i18n/en"

const DiffState = Schema.Struct({ diffStyle: Schema.Literals(["unified", "split"]) })

const PanelState = Schema.Struct({ expandMode: Schema.Literals(["expand", "collapse"]) })

const MobileDiff = Schema.Struct({ wrap: Schema.Boolean })

const SessionState = Schema.Struct({
  mode: Schema.optional(Schema.Literals(["git", "branch", "turn"])),
  file: Schema.optional(Schema.String),
  open: Schema.Array(Schema.String),
})

export default Extension.define({
  id: "review",
  provides: { changes: Changes },
  
  
  uses: { tree: FileTree, openIn: OpenInApp },
  stores: {
    diff: Store.global(
      DiffState,
      { diffStyle: "split" },
      {
        key: "layout",
        pick: (value: { review?: { diffStyle?: unknown } } | null) => {
          const diffStyle = value?.review?.diffStyle

          return diffStyle === undefined ? undefined : { diffStyle }
        },
      },
    ),
    panel: Store.global(
      PanelState,
      { expandMode: "collapse" },
      {
        key: "review-panel-v2",
        pick: (value: { expandMode?: unknown } | null) => {
          const expandMode = value?.expandMode

          return expandMode === undefined ? undefined : { expandMode }
        },
      },
    ),
    
    mobileDiff: Store.global(
      MobileDiff,
      { wrap: true },
      {
        key: "settings.v3",
        pick: (value: { general?: { mobileDiffWrap?: unknown } } | null) => {
          const wrap = value?.general?.mobileDiffWrap

          return wrap === undefined ? undefined : { wrap }
        },
      },
    ),
    
    session: Store.session(
      SessionState,
      { open: [] },
      {
        key: "layout",
        sessions: "sessionView",
        
        pick: (entry: { reviewMode?: unknown; reviewFile?: unknown; reviewOpen?: unknown } | undefined) =>
          entry && [entry.reviewMode, entry.reviewFile, entry.reviewOpen].some((field) => field !== undefined)
            ? { mode: entry.reviewMode, file: entry.reviewFile, open: entry.reviewOpen }
            : undefined,
      },
    ),
  },
  i18n: {
    en,
  },
})

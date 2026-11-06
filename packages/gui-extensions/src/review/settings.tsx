import { Switch } from "@chassis/ui/switch"
import { useExtension } from "../sdk"
import type Review from "./index"


export default function WrapLinesRow() {
  const ctx = useExtension<typeof Review>()
  const mobileDiff = ctx.stores.mobileDiff

  return (
    <div data-component="settings-row">
      <div data-slot="settings-row-copy">
        <div data-slot="settings-row-title">{ctx.t("settings.wrapLines.title")}</div>
        <div data-slot="settings-row-description">{ctx.t("settings.wrapLines.description")}</div>
      </div>
      <div data-slot="settings-row-control">
        <div data-action="settings-mobile-diff-wrap">
          <Switch
            aria-label={ctx.t("settings.wrapLines.title")}
            checked={mobileDiff.value.wrap}
            onChange={(checked) =>
              mobileDiff.update((draft) => {
                draft.wrap = checked
              })
            }
            hideLabel
          >
            {ctx.t("settings.wrapLines.title")}
          </Switch>
        </div>
      </div>
    </div>
  )
}

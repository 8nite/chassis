import { showToast } from "@chassis/ui/toast"
import { lazy, onCleanup, Suspense } from "solid-js"
import { createKeyed, onIdle, Command, SettingsPage, TitlebarItem, type Setup, type SetupContext } from "../sdk"
import { updaterAction } from "./action"
import type definition from "./index"

const setup: Setup<typeof definition> = (ctx) => {
  whatsNew(ctx)

  if (!ctx.desktop) return
  const updater = ctx.uses.updater

  const state = () => {
    const live = updater()

    return live.status === "active" ? live.value.state() : undefined
  }

  const act = (name: "check" | "install") => {
    const live = updater()

    if (live.status === "active") return void import("./actions").then((module) => module[name](ctx, live.value))

    
    showToast({ title: ctx.t("common.requestFailed") })
  }

  const Section = lazy(() => import("./section"))
  
  onCleanup(onIdle(() => void Section.preload()))

  ctx.add(TitlebarItem, () => {
    const current = state()
    const installing = current?.status === "installing"
    const ready = current?.status === "ready" || current?.status === "download-required"

    if (!ready && !installing) return

    return {
      id: "update",
      label: ctx.t("status.label"),
      title: ctx.t(updaterAction(current).label),
      busy: installing,
      run: () => act("install"),
    }
  })

  ctx.add(SettingsPage, {
    id: "updates",
    page: "general",
    available: "desktop",
    get title() {
      return ctx.t("section.title")
    },
    get entries() {
      return [
        { id: "settings-release-notes", title: ctx.t("releaseNotes.title") },
        { id: "settings-check-updates", title: ctx.t("check.title") },
      ]
    },
    render: () => (
      <Suspense>
        <Section
          state={state}
          run={() => {
            const run = updaterAction(state()).run

            if (run) act(run)
          }}
        />
      </Suspense>
    ),
  })

  ctx.add(Command, {
    id: "check",
    get title() {
      return ctx.t("menu.check")
    },
    hidden: true,
    run: () => act("check"),
  })

  
  
  createKeyed(updater, (client) => void client.on("check", () => act("check")))
}


function whatsNew(ctx: SetupContext<typeof definition>) {
  const version = ctx.build.version
  const seen = ctx.stores.seen
  const previous = seen.value.version

  if (!version || previous === version) return

  const markSeen = () =>
    seen.update((draft) => {
      draft.version = version
    })

  if (!previous || !ctx.stores.releaseNotes.value.enabled) return markSeen()

  void import("./whats-new").then((module) => {
    if (ctx.signal.aborted) return

    module.showWhatsNew(ctx, { previous, current: version, markSeen })
  })
}

export default setup

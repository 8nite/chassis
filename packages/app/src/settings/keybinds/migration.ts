import { batch, createEffect, untrack } from "solid-js"
import { Predicate } from "effect"
import type { useSettings } from "@/settings/model"


export const keybindRenames = {
  "app.checkForUpdates": "updater.check",
  "server.pair": "pairing.open",
  "server.ssh.add": "ssh.add",
  "debugBar.toggle": "debug.toggle",
  "session.btw": "btw.ask",
  
  "summary.toggle": "details.toggle",
  "session.summary.toggle": "details.toggle",
} satisfies Readonly<Record<string, string>>


export function migrateKeybinds(settings: Pick<ReturnType<typeof useSettings>, "ready" | "keybinds">) {
  const state = { done: false }

  createEffect(() => {
    if (state.done || !settings.ready()) return
    state.done = true
    untrack(() =>
      batch(() =>
        Object.entries(keybindRenames).forEach(([from, to]) => {
          const value = settings.keybinds.get(from)

          if (!Predicate.isString(value)) return

          if (settings.keybinds.get(to) === undefined) settings.keybinds.set(to, value)
          settings.keybinds.reset(from)
        }),
      ),
    )
  })
}

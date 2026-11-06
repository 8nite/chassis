import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { Panel, type StoreDeclaration } from "@chassis/gui-extensions/sdk"
import type { Platform } from "@/runtime/platform/platform"
import { persisted, removePersisted } from "@/runtime/persistence/storage"
import { legacyKeys } from "@/runtime/extension/panel-keys"
import { globalStoreTarget } from "@/runtime/extension/stores"
import { migrateKeybinds } from "@/settings/keybinds/migration"
import context from "../../gui-extensions/src/context/index"
import contextSetup from "../../gui-extensions/src/context/renderer"
import details from "../../gui-extensions/src/details/index"
import review from "../../gui-extensions/src/review/index"
import updater from "../../gui-extensions/src/updater/index"


const web: Platform = {
  platform: "web",
  openExternal: () => undefined,
  restart: async () => undefined,
  notify: async () => undefined,
  openDirectoryPickerDialog: async () => null,
}


test.each([
  {
    name: "namespace extension.summary.* → extension.details.*",
    home: () =>
      imported("details", "prefs", details.stores.prefs, "chassis.global.dat:extension.details.prefs", [
        ["chassis.global.dat:extension.summary.prefs", { projectExpanded: false, serverExpanded: false }],
      ]),
    expected: { projectExpanded: false, serverExpanded: false },
  },
  {
    name: "settings sessionSummary, from before extensions → extension.details.prefs",
    home: () =>
      imported("details", "prefs", details.stores.prefs, "chassis.global.dat:extension.details.prefs", [
        ["settings.v3", { sessionSummary: { projectExpanded: false, serverExpanded: true } }],
      ]),
    expected: { projectExpanded: false, serverExpanded: true },
  },
  {
    
    name: "layout review.diffStyle, from the unprefixed layout when the newer one lacks it → extension.review.diff",
    home: () =>
      imported("review", "diff", review.stores.diff, "chassis.global.dat:extension.review.diff", [
        ["chassis.global.dat:layout", { fileTree: { opened: true } }],
        ["layout", { review: { diffStyle: "unified" } }],
      ]),
    expected: { diffStyle: "unified" },
  },
  {
    name: "Preferences releaseNotes → extension.updater.releaseNotes",
    home: () =>
      imported(
        "updater",
        "releaseNotes",
        updater.stores.releaseNotes,
        "chassis.global.dat:extension.updater.releaseNotes",
        [["settings.v3", { general: { releaseNotes: false } }]],
      ),
    expected: { enabled: false },
  },
  {
    name: "Preferences mobileDiffWrap → extension.review.mobileDiff",
    home: () =>
      imported("review", "mobileDiff", review.stores.mobileDiff, "chassis.global.dat:extension.review.mobileDiff", [
        ["settings.v3", { general: { mobileDiffWrap: false } }],
      ]),
    expected: { wrap: false },
  },
  {
    name: "What's New highlights.v1 → extension.updater.seen",
    home: () =>
      imported("updater", "seen", updater.stores.seen, "chassis.global.dat:extension.updater.seen", [
        ["highlights.v1", { version: "2.0.20" }],
      ]),
    expected: { version: "2.0.20" },
  },
  {
    name: "keybind summary.toggle → details.toggle",
    home: () => renamed([["summary.toggle", "f9"]]),
    expected: { "details.toggle": "f9" },
  },
  {
    name: "keybind session.summary.toggle, from before extensions → details.toggle",
    home: () => renamed([["session.summary.toggle", "f8"]]),
    expected: { "details.toggle": "f8" },
  },
  {
    name: "panel key usage:context → context:main",
    home: () => legacyKeys(contextPanels()).get("usage:context"),
    expected: "context:main",
  },
  {
    name: "panel key context, from before extensions → context:main",
    home: () => legacyKeys(contextPanels()).get("context"),
    expected: "context:main",
  },
])("$name", (row) => {
  expect(row.home()).toEqual(row.expected)
})


function imported(
  extension: string,
  name: string,
  declaration: StoreDeclaration,
  home: string,
  seed: readonly (readonly [string, object])[],
) {
  localStorage.clear()
  
  removePersisted(globalStoreTarget(extension, name, undefined), web)
  seed.forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)))
  createRoot((dispose) => {
    persisted(globalStoreTarget(extension, name, declaration.from), declaration.schema, declaration.initial, web)
    dispose()
  })

  return JSON.parse(localStorage.getItem(home) ?? "null")
}


function renamed(stored: readonly (readonly [string, string])[]) {
  const keybinds = new Map(stored)

  const dispose = createRoot((dispose) => {
    migrateKeybinds({
      ready: () => true,
      keybinds: {
        get: (id: string) => keybinds.get(id),
        set: (id: string, value: string) => keybinds.set(id, value),
        reset: (id: string) => keybinds.delete(id),
      },
    })

    return dispose
  })

  dispose()

  return Object.fromEntries(keybinds)
}


function contextPanels() {
  const panels: { extension: string; value: Panel }[] = []

  const fake = {
    t: (key: string) => key,
    add: (registry: { readonly id: string }, item: () => Panel) => {
      if (registry.id === Panel.id) panels.push({ extension: context.id, value: item() })

      return () => undefined
    },
  }

  createRoot((dispose) => {
    
    
    
    contextSetup(fake as unknown as Parameters<typeof contextSetup>[0])
    dispose()
  })

  return panels
}

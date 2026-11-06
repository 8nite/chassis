import { ensurePluginRuntime, provides } from "@chassis/plugin/runtime"
import { Plugin, PluginContextProvider, usePlugin } from "@chassis/plugin/tui"
import { ensureRuntimePluginSupport } from "@opentui/solid/runtime-plugin-support/configure"

ensurePluginRuntime()
ensureRuntimePluginSupport({
  additional: {
    "@chassis/plugin/tui": { Plugin, PluginContextProvider, usePlugin },
  },
  preserve: provides,
})

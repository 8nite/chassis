import { DynamicProviderPlugin } from "./provider/dynamic.js"
import { GithubCopilotPlugin } from "./provider/github-copilot.js"
import type { PluginInternal } from "./internal.js"

// ponytail: generic npm-provider loader for config-defined custom providers (e.g. opencode-go).
export const ProviderPlugins: PluginInternal.InternalPlugin[] = [GithubCopilotPlugin, DynamicProviderPlugin]

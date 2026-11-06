import { Effect } from "effect"
import { Npm } from "@chassis/util/npm"
import { importModule, resolveModule } from "@chassis/util/runtime-import"

export const loadSDKFactory = Effect.fnUntraced(function* (npm: Npm.Interface, packageName: string) {
  const installedPath = packageName.startsWith("file://")
    ? packageName
    : yield* npm.add(installSpec(packageName)).pipe(
        Effect.orDie,
        Effect.map((installed) => resolveModule(installed.name, installed.directory)),
      )

  const mod = (yield* Effect.promise(() => importModule(installedPath))) as Record<string, unknown>
  const match = Object.keys(mod).find((name) => name.startsWith("create"))
  if (!match) return yield* Effect.die(new Error(`Package ${packageName} has no provider factory export`))
  return mod[match]
})




function installSpec(packageName: string) {
  return /^@ai-sdk\/[^/@]+$/.test(packageName) ? `${packageName}@ai-v6` : packageName
}

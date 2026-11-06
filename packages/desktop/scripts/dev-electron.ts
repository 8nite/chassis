import { $ } from "bun"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export async function prepareDevElectron() {
  const electron = dirname(fileURLToPath(import.meta.resolve("electron/package.json")))
  const icon = Bun.file(join(import.meta.dirname, "../icons/dev/icon.icns"))

  const hash = new Bun.CryptoHasher("sha256")
    .update(electron)
    .update(process.arch)
    .update(await Bun.file(join(electron, "package.json")).text())
    .update(await icon.arrayBuffer())
    .update(await Bun.file(import.meta.filename).text())
    .digest("hex")
    .slice(0, 16)

  const root = join(import.meta.dirname, "../node_modules/.cache/chassis-dev", hash)
  const bundle = join(root, "Chassis Dev.app")
  
  const executable = join(bundle, "Contents/MacOS/Electron")

  if (await Bun.file(join(root, "ready")).exists()) return executable

  
  await $`mkdir -p ${root}`
  await $`ditto ${join(electron, "dist/Electron.app")} ${bundle}`
  const plist = join(bundle, "Contents/Info.plist")

  for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
    await $`plutil -replace ${key} -string ${"Chassis Dev"} ${plist}`
  }

  await $`plutil -replace CFBundleIdentifier -string ai.chassis.desktop.dev ${plist}`
  await $`plutil -insert NSAutoFillRequiresTextContentTypeForOneTimeCodeOnMac -bool true ${plist}`
  await Bun.write(join(bundle, "Contents/Resources/electron.icns"), icon)
  
  await $`codesign --force --deep --sign - ${bundle}`
  await Bun.write(join(root, "ready"), "")

  return executable
}

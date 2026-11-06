import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"

export type ChassisPtyAsset = {
  readonly source: string
  readonly version: string
  readonly sha256: string
}

type Target = {
  readonly platform: string
  readonly arch: string
  readonly libc?: "glibc" | "musl"
}

const core = createRequire(path.resolve(import.meta.dirname, "../../core/package.json"))
const pty = createRequire(core.resolve("@chassis/pty/package.json"))

export async function resolveChassisPty(target: Target): Promise<ChassisPtyAsset | undefined> {
  if (target.platform !== "darwin" && target.platform !== "linux") return undefined
  if (target.arch !== "arm64" && target.arch !== "x64") return undefined

  const suffix = [target.platform, target.arch, target.platform === "linux" ? (target.libc ?? "glibc") : undefined]
    .filter(Boolean)
    .map((value) => (value === "glibc" ? "gnu" : value))
    .join("-")
  const name = `@chassis/pty-${suffix}`
  const local = process.env.CHASSIS_PTY_BIN
  if (local && (target.platform !== process.platform || target.arch !== process.arch))
    throw new Error("CHASSIS_PTY_BIN can only be embedded in a build for the current platform and architecture")
  if (local) {
    const source = path.resolve(local)
    return {
      source,
      version: "local",
      sha256: createHash("sha256")
        .update(await readFile(source))
        .digest("hex"),
    }
  }
  let manifestPath: string
  let source: string
  try {
    manifestPath = pty.resolve(`${name}/package.json`)
    source = pty.resolve(`${name}/bin/chassis-pty`)
  } catch {
    // ponytail: platform package not vendored/published (e.g. darwin-arm64); build without embedded pty, runtime falls back to CHASSIS_PTY_BIN/PATH.
    return undefined
  }
  const manifest: unknown = JSON.parse(await readFile(manifestPath, "utf8"))
  if (!manifest || typeof manifest !== "object" || !("version" in manifest) || typeof manifest.version !== "string")
    throw new Error(`Invalid package metadata for ${name}`)

  return {
    source,
    version: manifest.version,
    sha256: createHash("sha256")
      .update(await readFile(source))
      .digest("hex"),
  }
}

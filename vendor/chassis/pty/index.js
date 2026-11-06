import { createRequire } from "node:module"
import path from "node:path"

const require = createRequire(import.meta.url)
const supported = process.platform === "darwin" || process.platform === "linux" || process.platform === "win32"
const arch = process.arch === "arm64" || process.arch === "x64" ? process.arch : undefined
const libc = process.platform === "linux" ? (process.report.getReport().header.glibcVersionRuntime ? "gnu" : "musl") : ""
const suffix = [process.platform, arch, libc].filter(Boolean).join("-")

function resolveBinary() {
  if (!supported || !arch) return undefined
  try {
    return path.join(
      path.dirname(require.resolve(`@chassis/pty-${suffix}/package.json`)),
      "bin",
      process.platform === "win32" ? "chassis-pty.exe" : "chassis-pty",
    )
  } catch {
    // ponytail: platform package may not be vendored/published; callers fall back to CHASSIS_PTY_BIN or PATH.
    return undefined
  }
}

export const binaryPath = resolveBinary()

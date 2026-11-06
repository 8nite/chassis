import { createRequire } from "node:module"

declare const CHASSIS_LIBC: string | undefined



export default function load() {
  const require = createRequire(import.meta.url)
  const libc = typeof CHASSIS_LIBC === "undefined" ? undefined : CHASSIS_LIBC
  return require(
    process.env.CHASSIS_PARCEL_WATCHER_PATH ??
      `@parcel/watcher-${process.platform}-${process.arch}${process.platform === "linux" ? `-${libc || "glibc"}` : ""}`,
  )
}

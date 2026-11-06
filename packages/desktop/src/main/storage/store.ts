import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import electron from "electron"

import { SETTINGS_STORE } from "./keys"

const cache = new Map<string, SettingsStore>()

export type SettingsStore = ReturnType<typeof createSettingsStore>












export function getStore(name = SETTINGS_STORE) {
  const cached = cache.get(name)

  if (cached) return cached
  const next = createSettingsStore(path.join(electron.app.getPath("userData"), name))
  cache.set(name, next)

  return next
}

export function createSettingsStore(file: string) {
  let data = read(file)

  const write = () => {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(`${file}.tmp`, JSON.stringify(data, null, "\t"))
    renameSync(`${file}.tmp`, file)
  }

  return {
    path: file,
    get: (key: string): unknown => data[key],
    set: (key: string, value: unknown) => {
      if (value === undefined) throw new TypeError(`Use \`delete()\` to clear values: ${key}`)
      data = { ...data, [key]: value }
      write()
    },
    delete: (key: string) => {
      data = Object.fromEntries(Object.entries(data).filter(([item]) => item !== key))
      write()
    },
  }
}


function read(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {}

  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"))

    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    renameSync(file, `${file}.corrupt`)

    return {}
  }
}

import type { MainStoreFrom, Mutable, Storage } from "@chassis/gui-extensions/sdk/main"
import { Option, Schema } from "effect"
import type { StateStore } from "../storage/state"
import type { SettingsStore } from "../storage/store"


type Shared = { json?: string | null }


type Decoded<T> = { value?: { readonly json: string | null; readonly current: T } }


export type SettingsFiles = (file?: string) => SettingsStore


export function createStorage(state: StateStore, settings: SettingsFiles, id: string): Storage {
  const name = namespace(id)
  
  const keys = new Map<string, Shared>()

  const shared = (key: string) => {
    const existing = keys.get(key)

    if (existing) return existing
    const created: Shared = {}
    keys.set(key, created)

    return created
  }

  const sources = (from: MainStoreFrom | readonly MainStoreFrom[] | undefined) =>
    [from ?? []].flat().map((item) => source(state, settings, item))

  const remove = (key: string, from: MainStoreFrom | readonly MainStoreFrom[] | undefined) => {
    
    sources(from).forEach((older) => older.remove())

    if (state.get(name, key) !== null) state.delete(name, key)
    state.flush()
    
    const entry = keys.get(key)

    if (entry) entry.json = null
  }

  return {
    store(key, options) {
      const codec = Schema.toCodecJson(options.schema)
      const legacy = sources(options.from)
      const entry = shared(key)
      const decoded: Decoded<typeof options.initial> = {}

      
      
      const read = () => {
        const stored = state.get(name, key)

        if (stored !== null) return stored

        
        const found = legacy.reduce<{ readonly value: unknown } | undefined>((match, older) => {
          if (match) return match
          const value = older.read()

          return value !== undefined && Option.isSome(Schema.decodeUnknownOption(codec)(value)) ? { value } : undefined
        }, undefined)

        if (!found) return null
        const json = JSON.stringify(found.value)
        state.set(name, key, json)

        return json
      }

      const current = () => {
        
        if (entry.json === undefined) entry.json = read()
        const json = entry.json
        const cached = decoded.value

        if (cached && cached.json === json) return cached.current
        const value = json === null ? Option.none() : Schema.decodeUnknownOption(Schema.fromJsonString(codec))(json)
        const next = { json, current: Option.getOrElse(value, () => options.initial) }
        decoded.value = next

        return next.current
      }

      
      const write = (value: typeof options.initial) => {
        const encoded = Schema.encodeSync(codec)(value)
        const json = JSON.stringify(encoded)

        state.set(name, key, json)
        state.flush()
        entry.json = json
        decoded.value = { json, current: Schema.decodeSync(codec)(encoded) }
      }

      return {
        get value() {
          return current()
        },
        ready: () => true,
        
        
        update(mutate) {
          const draft = Schema.decodeSync(codec)(Schema.encodeSync(codec)(current()))
          
          const returned = mutate(draft as Mutable<typeof options.initial>)

          if (returned !== undefined)
            throw new Error("Persisted.update must not return a value. Use set(next) to replace the value.")

          write(draft)
        },
        set: write,
      }
    },
    remove: (key, options) => remove(key, options?.from),
  }
}

export function namespace(id: string) {
  return `extension.${id}`
}


function source(state: StateStore, settings: SettingsFiles, from: MainStoreFrom) {
  if ("settings" in from) {
    const store = () => settings(from.file)

    return {
      read: () => store().get(from.settings),
      remove() {
        if (store().get(from.settings) !== undefined) store().delete(from.settings)
      },
    }
  }

  const [space, key] = from.state

  return {
    read() {
      const value = state.get(space, key)

      if (value === null) return undefined

      return Option.getOrUndefined(Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))(value))
    },
    remove() {
      if (state.get(space, key) !== null) state.delete(space, key)
    },
  }
}

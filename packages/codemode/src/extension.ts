export * as Extension from "./extension.js"


export type Extension = {
  readonly name: string
  readonly globals: Readonly<Record<string, Function>>
}

export const make = (options: Extension): Extension => {
  for (const [name, value] of Object.entries(options.globals)) {
    if (typeof value !== "function") {
      throw new TypeError(`Extension "${options.name}" global "${name}" must be a function.`)
    }
  }
  return { name: options.name, globals: { ...options.globals } }
}

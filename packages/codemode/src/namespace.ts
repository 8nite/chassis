import type { Tools } from "./tools.js"


export type Namespace<R = never> = {
  readonly _tag: "CodeModeNamespace"
  readonly description?: string
  readonly tools: Tools<R>
}


export type Options<R = never> = {
  readonly description?: string
  readonly tools: Tools<R>
}

export const isNamespace = <R = never>(value: Namespace<R> | Tools<R>): value is Namespace<R> =>
  Object.hasOwn(value, "_tag") && value._tag === "CodeModeNamespace"


export const make = <R = never>(options: Options<R>): Namespace<R> => ({
  _tag: "CodeModeNamespace",
  ...(options.description === undefined ? {} : { description: options.description }),
  tools: options.tools,
})

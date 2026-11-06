import type { Node } from "acorn"
import { Context } from "effect"
import type { ErrorType } from "./intrinsics.js"
import type { DiagnosticKind } from "../codemode.js"
import type { ErrorObj, Value } from "./objects.js"


export type AstNode = Node


export const CallSite = Context.Reference<{ readonly node?: AstNode; readonly depth: number }>("codemode/CallSite", {
  defaultValue: () => ({ depth: 0 }),
})

export type Binding = {
  mutable: boolean
  value: Value
  initialized?: boolean
}

export type StatementResult =
  | { kind: "none" }
  | { kind: "return"; value: Value }
  | { kind: "break"; label?: string }
  | { kind: "continue"; label?: string }

export type GeneratorRequestKind = "next" | "return" | "throw"

export const AsyncIteratorSymbol: unique symbol = Symbol("codemode.async-iterator")
export const IteratorSymbol: unique symbol = Symbol("codemode.iterator")
export const IteratorSymbols = [AsyncIteratorSymbol, IteratorSymbol] as const

export class Throw {
  constructor(readonly value: Value) {}
}

export class GeneratorReturn {
  constructor(readonly value: Value) {}
}

export const OptionalShortCircuit: unique symbol = Symbol("codemode.optional-short-circuit")


export class PendingThrow {
  node?: AstNode
  value?: ErrorObj

  constructor(
    
    readonly type: ErrorType,
    readonly message: string,
    node?: AstNode,
    readonly kind: DiagnosticKind = "ExecutionFailure",
    readonly suggestions?: ReadonlyArray<string>,
  ) {
    if (node) this.node = node
  }
}

const failure = (type: ErrorType, kind?: DiagnosticKind) => (message: string, node?: AstNode) =>
  new PendingThrow(type, message, node, kind)

export const typeError = failure("TypeError")
export const invalidData = failure("TypeError", "InvalidDataValue")
export const rangeError = failure("RangeError")
export const referenceError = failure("ReferenceError")
export const syntaxError = failure("SyntaxError")
export const uriError = failure("URIError")


export const supportedSyntaxMessage =
  "This is a restricted JavaScript-like language. Supported: plain and async functions, data literals, destructuring, standard control flow, await and Promise, and built-ins such as Array, Object, Math, JSON, Date, RegExp, Map, Set, and URL. Unsupported: classes, getters/setters, BigInt, and custom Symbols. Use plain functions and data objects instead."

export const unsupportedSyntax = (kind: string, node: AstNode): PendingThrow =>
  new PendingThrow(
    "SyntaxError",
    `Syntax '${kind}' is not supported. ${supportedSyntaxMessage}`,
    node,
    "UnsupportedSyntax",
    [supportedSyntaxMessage],
  )


export const sourceLocation = (node: AstNode): { readonly line: number; readonly column: number } => ({
  line: node.loc?.start.line ?? 1,
  column: (node.loc?.start.column ?? 0) + 1,
})

export const formatLocation = (node?: AstNode): string => {
  if (!node?.loc) return ""
  const location = sourceLocation(node)
  return ` (line ${location.line}, col ${location.column})`
}

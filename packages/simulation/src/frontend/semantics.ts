import type { Renderable } from "@opentui/core"
import type { SimulationProtocol } from "../protocol"




export type Definition = Omit<SimulationProtocol.Frontend.SemanticNode, "id" | "element" | "parent">

const key = Symbol.for("chassis.simulation.semantics")
type SemanticRenderable = Renderable & { [key]?: () => Definition }

const bind = (definition: () => Definition) => (renderable: Renderable) => {
  Object.defineProperty(renderable, key, { value: definition, configurable: true })
}

export const read = (renderable: Renderable) => (renderable as SemanticRenderable)[key]

export const SimulationSemantics = { bind, read }

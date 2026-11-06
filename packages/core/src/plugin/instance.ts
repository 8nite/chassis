export * as InstancePlugins from "./instance.js"

import type { Plugin } from "@chassis/plugin/effect/plugin"
import { Context, Layer } from "effect"
import { makeLocationNode } from "@chassis/util/effect/app-node"
import type { Generation } from "../plugin.js"


export type List = readonly Plugin[]

export interface Interface {
  readonly all: () => readonly Generation[]
}

export class Service extends Context.Service<Service, Interface>()("@chassis/InstancePlugins") {}

export const node = makeLocationNode({
  service: Service,
  layer: bound([]),
  deps: [],
})






export function bound(plugins: List) {
  const duplicates = plugins.filter((plugin, index) => plugins.findIndex((other) => other.id === plugin.id) !== index)
  if (duplicates.length > 0) {
    throw new Error(`duplicate instance plugin ids: ${duplicates.map((plugin) => plugin.id).join(", ")}`)
  }
  const stamped = plugins.map((plugin): Generation => ({ ...plugin, revision: "instance", source: { type: "sdk" } }))
  return Layer.succeed(Service, Service.of({ all: () => stamped }))
}

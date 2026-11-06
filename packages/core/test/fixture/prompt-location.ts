import type { FileSystem } from "@chassis/core/filesystem"
import { Bus } from "@chassis/core/bus"
import { Image } from "@chassis/core/image"
import { LocationServiceMap } from "@chassis/core/location-service-map"
import type { LocationServices } from "@chassis/core/location-services"
import { Plugin } from "@chassis/core/plugin"
import { PluginHooks } from "@chassis/core/plugin/hooks"
import { Skill } from "@chassis/core/skill"
import type { Location } from "@chassis/schema/location"
import { makeGlobalNode } from "@chassis/util/effect/app-node"
import { LayerNode } from "@chassis/util/effect/layer-node"
import { Effect, Layer, LayerMap } from "effect"


export const promptLocationNode = makeGlobalNode({
  service: LocationServiceMap.Service,
  layer: Layer.effect(
    LocationServiceMap.Service,
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      return yield* LayerMap.make(
        (_ref: Location.Ref) =>
          LayerNode.compile(LayerNode.group([PluginHooks.node, Image.node, Skill.node, Plugin.node]), {
            replacements: [
              Bus.node.replace(Layer.succeed(Bus.Service, bus)),
              Plugin.node.replace(Layer.mock(Plugin.Service, { awaitActivation: Effect.void })),
            ],
          }) as unknown as Layer.Layer<LocationServices, FileSystem.DirectoryNotFoundError>,
      )
    }),
  ),
  deps: [Bus.node],
})

import { LayerNode } from "@chassis/util/effect/layer-node"
import { makeGlobalNode } from "@chassis/util/effect/app-node"
import { httpClient } from "@chassis/util/effect/app-node-platform"
import { SdkPlugins } from "@chassis/core/plugin/sdk"
import { Config, Effect, FileSystem, Layer } from "effect"
import { HttpClient } from "effect/http"
import { DriveManifest } from "../manifest"
import { SimulationNetwork } from "./network"
import { SimulationOpenAI } from "./openai"
import { SimulatedProvider } from "./simulated-provider"



export const simulationReplacements: (app: {
  readonly version: string
}) => Effect.Effect<LayerNode.Replacements, Error, FileSystem.FileSystem> = Effect.fn("Simulation.replacements")(
  function* (app: { readonly version: string }) {
    
    
    const models = SimulationNetwork.json("GET", "https://models./api.json", {})
    const drive = yield* Config.String("CHASSIS_DRIVE").pipe(Config.withDefault(undefined))
    if (!drive) return [httpClient.replace(SimulationNetwork.layer([models]))] satisfies LayerNode.Replacements

    const manifest = yield* DriveManifest.resolve()
    const networkLayer = Layer.effect(
      HttpClient.HttpClient,
      Effect.gen(function* () {
        const provider = yield* SimulatedProvider.Service
        const network = yield* SimulationNetwork.make([SimulationOpenAI.route(provider), models])
        return network.client
      }),
    ).pipe(
      Layer.provide(
        SimulatedProvider.layerDrive({
          endpoint: manifest.endpoints.backend,
          version: app.version,
        }),
      ),
      
      Layer.orDie,
    )
    const networkNode = makeGlobalNode({
      service: HttpClient.HttpClient,
      layer: networkLayer,
      deps: [SdkPlugins.node],
    })
    return [httpClient.replace(networkNode)] satisfies LayerNode.Replacements
  },
)

export * as Simulation from "./index"

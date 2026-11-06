import { Environment } from "@chassis/core/environment/index"
import { CrossSpawnSpawner } from "@chassis/util/cross-spawn-spawner"
import { LayerNode } from "@chassis/util/effect/layer-node"
import { Effect, Layer } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"


export const hostEnvironmentLayer = Layer.effect(
  Environment.Service,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const driver = Environment.makeLocalDriver(spawner)
    return Environment.Service.of({ files: Environment.makeFiles(driver), spawner: driver.spawner })
  }),
).pipe(Layer.provide(LayerNode.compile(CrossSpawnSpawner.node)))


export const recordingEnvironmentLayer = (spawns: Array<ChildProcess.Command>) =>
  Layer.effect(
    Environment.Service,
    Effect.gen(function* () {
      const environment = yield* Environment.Service
      return Environment.Service.of({
        ...environment,
        spawner: ChildProcessSpawner.make((command) => {
          spawns.push(command)
          return environment.spawner.spawn(command)
        }),
      })
    }),
  ).pipe(Layer.provide(hostEnvironmentLayer))

export type EnvironmentFilesTransform = (files: Environment.Files) => Partial<Environment.Files>


export function transformEnvironmentFiles(transform: EnvironmentFilesTransform = () => ({})) {
  return Layer.effect(
    Environment.Service,
    Effect.gen(function* () {
      const current = yield* Environment.Service
      return Environment.Service.of({
        ...current,
        files: { ...current.files, ...transform(current.files) },
      })
    }),
  ).pipe(Layer.provide(hostEnvironmentLayer))
}

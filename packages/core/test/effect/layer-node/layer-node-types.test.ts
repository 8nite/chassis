import { test } from "bun:test"
import { Context, Effect, Layer } from "effect"
import { LayerNode } from "@chassis/util/effect/layer-node"
import { makeGlobalNode, makeLocationNode } from "@chassis/util/effect/app-node"

class A extends Context.Service<A, {}>()("test/LayerNodeA") {}
class B extends Context.Service<B, {}>()("test/LayerNodeB") {}
class C extends Context.Service<C, {}>()("test/LayerNodeC") {}
class LayerError {
  readonly _tag = "LayerError"
}
class OtherError {
  readonly _tag = "OtherError"
}


const contracts = (tag: LayerNode.Tag<"app"> | LayerNode.Tag<"other">, flag: boolean) => {
  const tags = LayerNode.tags({ app: [] })
  const make = tags.make("app")
  const aLayer = Layer.succeed(A, A.of({}))
  const bLayer = Layer.effect(B, Effect.as(A, B.of({})))
  const cLayer = Layer.effect(
    C,
    Effect.gen(function* () {
      yield* A
      yield* B
      return C.of({})
    }),
  )
  const a = make({ service: A, layer: aLayer, deps: [] })
  const b = make({ service: B, layer: bLayer, deps: [a] })
  const c = make({ service: C, layer: cLayer, deps: [a, b] })
  const ab = make({ name: "a-and-b", layer: Layer.mergeAll(aLayer, Layer.succeed(B, {})), deps: [] })
  const failing = make({ service: A, layer: Layer.effect(A, Effect.fail(new LayerError())), deps: [] })
  const dependent = make({ service: B, layer: bLayer, deps: [failing] })
  const inputA = LayerNode.unbound(A, tags.values.app)
  const group = LayerNode.group([a, b])

  make({ name: "manual-a", layer: aLayer, deps: [] })
  
  make({ layer: aLayer, deps: [] })
  
  make({ service: A, name: "a", layer: aLayer, deps: [] })
  
  LayerNode.make<typeof aLayer, readonly [], typeof tags.values.app>({ service: A, layer: aLayer, deps: [] })
  
  make({ service: B, layer: bLayer, deps: [] })
  
  make({ service: C, layer: cLayer, deps: [a] })
  const erasedLayer: Layer.Any = bLayer
  
  make({ service: B, layer: erasedLayer, deps: [] })

  LayerNode.compile(c) satisfies Layer.Layer<C, never, never>
  LayerNode.compile(dependent) satisfies Layer.Layer<B, LayerError, never>
  LayerNode.compile(group) satisfies Layer.Layer<A | B, never, never>
  LayerNode.compile(LayerNode.group([])) satisfies Layer.Layer<never>
  
  LayerNode.compile(LayerNode.group([])) satisfies Layer.Layer<A>
  LayerNode.compile(inputA, { replacements: [inputA.replace(a)] }) satisfies Layer.Layer<A, never, never>
  
  LayerNode.compile(c) satisfies Layer.Layer<A | C>
  
  LayerNode.compile(dependent) satisfies Layer.Layer<B>

  const replacements: LayerNode.Replacements = [a.replace(aLayer), a.replace(ab), failing.replace(a)]
  const replacement: LayerNode.Replacement = a.replace(Layer.mergeAll(aLayer, Layer.succeed(B, {})))
  LayerNode.compile(a, { replacements: [...replacements, replacement] })
  inputA.replace(a)
  a.replace(a)
  
  ab.replace(aLayer)
  
  ab.replace(a)
  
  a.replace(Layer.succeed(B, {}))
  
  a.replace(b)
  
  a.replace(Layer.effect(A, Effect.as(B, A.of({}))))
  
  a.replace(Layer.effect(A, Effect.fail(new OtherError())))
  
  a.replace(failing)
  
  failing.replace(Layer.effect(A, Effect.fail(new OtherError())))
  
  a.replace(flag ? a : b)
  
  a.replace(flag ? aLayer : Layer.succeed(B, {}))
  
  a.replace(flag ? a : failing)
  a.replace(flag ? a : ab)
  failing.replace(flag ? a : failing)
  
  const invalidStored: LayerNode.Replacements = [a.replace(b)]
  
  const rawStored: LayerNode.Replacements = [[a, aLayer]]
  
  LayerNode.compile(a, { replacements: [[a, aLayer]] })
  
  const forged: LayerNode.Replacement = { source: a, target: a }
  
  group.replace(a)
  
  a.replace(group)
  
  const groupNode: LayerNode.Node<A | B, never, typeof tags.values.app> = group
  
  const forgedGraph: LayerNode.Graph<A> = { name: "a" }

  const aContract: LayerNode.Node<A, never, typeof tags.values.app> = a
  aContract.replace(aLayer)
  
  a.replace.call(ab, aLayer)
  const detached = a.replace
  
  detached(aLayer)
  
  const narrowedOutput: LayerNode.Node<A, never, typeof tags.values.app> = ab
  
  const widenedOutput: LayerNode.Node<A | B, never, typeof tags.values.app> = a
  
  const widenedError: LayerNode.Node<A, LayerError, typeof tags.values.app> = a
  
  const narrowedError: LayerNode.Node<A, never, typeof tags.values.app> = failing
  
  const widenedTag: LayerNode.Node<A, never, LayerNode.Tag | undefined> = a
  const unionTag = LayerNode.unbound(A, tag)
  
  const narrowedTag: LayerNode.Node<A, never, typeof tags.values.app> = unionTag

  const outputProjection: LayerNode.Graph<A, never, typeof tags.values.app> = group
  
  const widenedGraph: LayerNode.Graph<A | B, never, typeof tags.values.app> = a
  
  outputProjection.replace(aLayer)

  const choice = flag ? a : b
  
  make({ service: C, layer: cLayer, deps: [choice] })
  
  LayerNode.compile(LayerNode.group([choice])) satisfies Layer.Layer<A | B>
  const conditional = make({ name: "conditional", layer: flag ? aLayer : Layer.succeed(B, {}), deps: [] })
  LayerNode.compile(conditional) satisfies Layer.Layer<never>
  
  LayerNode.compile(conditional) satisfies Layer.Layer<A | B>
  LayerNode.compile(LayerNode.group([flag ? a : ab])) satisfies Layer.Layer<A>
  const dynamic: Array<typeof a> = []
  
  LayerNode.compile(LayerNode.group(dynamic)) satisfies Layer.Layer<A>

  const decorated = b.mapLayer((layer) => layer.pipe(Layer.tap(() => Effect.void)))
  LayerNode.compile(decorated) satisfies Layer.Layer<B>
  b.replace(decorated)
  
  ab.mapLayer.call(a, (layer) => layer)
  
  b.mapLayer((layer) => layer.pipe(Layer.tap(() => C)))
  
  b.mapLayer((layer) => layer.pipe(Layer.tap(() => Effect.fail(new OtherError()))))
  
  ab.mapLayer(() => aLayer)
  
  inputA.mapLayer((layer: Layer.Layer<A>) => layer)

  const scopedTags = LayerNode.tags({ request: ["global"], global: [] })
  const request = scopedTags.make("request")
  const global = scopedTags.make("global")
  const globalA = global({ service: A, layer: aLayer, deps: [] })
  const requestA = request({ service: A, layer: aLayer, deps: [] })
  const requestB = request({ service: B, layer: Layer.succeed(B, {}), deps: [] })
  request({ service: B, layer: bLayer, deps: [globalA] })
  request({ service: C, layer: cLayer, deps: [globalA, requestB] })
  request({ service: C, layer: cLayer, deps: [LayerNode.group([globalA, requestB])] })
  LayerNode.compile(LayerNode.group([globalA, requestB]), { shared: scopedTags.values.global }) satisfies Layer.Layer<
    A | B
  >
  
  LayerNode.tags({ request: ["missing"], global: [] })
  
  LayerNode.compile(globalA, { shared: "global" })
  
  globalA.replace(requestA)
  
  requestA.replace(globalA)
  
  globalA.replace(flag ? globalA : requestA)
  
  request({ service: C, layer: cLayer, deps: [globalA] })
  
  request({ service: C, layer: cLayer, deps: [requestB] })
  
  request({ service: C, layer: cLayer, deps: [globalA, requestA] })
  
  request({ service: C, layer: cLayer, deps: [LayerNode.group([globalA])] })
  
  global({ service: B, layer: bLayer, deps: [requestA] })
  
  global({ service: B, layer: bLayer, deps: [LayerNode.group([requestA])] })

  const globalScopedA = makeGlobalNode({ service: A, layer: aLayer, deps: [] })
  const locationScopedA = makeLocationNode({ service: A, layer: aLayer, deps: [] })
  makeGlobalNode({ service: B, layer: bLayer, deps: [globalScopedA] })
  makeLocationNode({ service: B, layer: bLayer, deps: [globalScopedA] })
  makeLocationNode({ service: B, layer: bLayer, deps: [locationScopedA] })
  
  makeGlobalNode({ service: B, layer: bLayer, deps: [locationScopedA] })
  
  makeLocationNode({ service: B, layer: bLayer, deps: [] })

  void [
    invalidStored,
    rawStored,
    forged,
    groupNode,
    forgedGraph,
    narrowedOutput,
    widenedOutput,
    widenedError,
    narrowedError,
    widenedTag,
    narrowedTag,
    widenedGraph,
  ]
}

test("layer node type contracts compile", () => {
  void contracts
})

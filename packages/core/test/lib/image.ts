import { Image } from "@chassis/core/image"
import { Effect, Layer } from "effect"


export const imagePassthrough = Layer.mock(Image.Service, {
  normalize: (_resource, content) => Effect.succeed(content),
})

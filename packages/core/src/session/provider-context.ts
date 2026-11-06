export * as SessionProviderContext from "./provider-context.js"

import { Message } from "@chassis/ai"
import { SessionProviderContext } from "@chassis/schema/session-provider-context"
import { Predicate, Schema } from "effect"
import { isDeepStrictEqual } from "node:util"
import { Hash } from "@chassis/util/hash"
import type { SessionMessage } from "./message.js"
import type { SessionRunnerModel } from "./runner/model.js"

export type Provenance = SessionProviderContext.Provenance
export const Info = SessionProviderContext.Info
export type Info = SessionProviderContext.Info

const messages = Schema.toCodecJson(Schema.Array(Message))


export function provenance(resolved: Pick<SessionRunnerModel.Resolved, "model" | "ref">): Provenance | undefined {
  const model = resolved.model
  const endpoint = model.route.endpoint
  if (!endpoint.baseURL || typeof endpoint.path !== "string") return undefined
  return {
    providerID: resolved.ref.providerID,
    provider: model.provider,
    modelID: model.id,
    route: model.route.id,
    protocol: model.route.protocol,
    endpoint: Hash.sha256(
      JSON.stringify([
        endpoint.baseURL,
        endpoint.path,
        Object.entries(endpoint.query ?? {}).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
      ]),
    ),
  }
}

export const compatible = (source: Provenance, target: Provenance | undefined) =>
  target !== undefined && isDeepStrictEqual(source, target)


export const isCheckpoint = (
  message: SessionMessage.Info,
): message is SessionMessage.CompactionCompleted & { readonly providerContext: Info } =>
  message.type === "compaction" && message.status === "completed" && message.providerContext !== undefined


export const encode = (provenance: Provenance, replacement: ReadonlyArray<Message>): Info => ({
  version: 1,
  provenance,
  messages: Schema.decodeSync(Schema.fromJsonString(Schema.Json))(JSON.stringify(replacement)),
})

export const decode = (context: Info) => Schema.decodeUnknownSync(messages)(upgradeLegacyMedia(context.messages))
export const validate = (context: Info) => Schema.decodeUnknownEffect(messages)(upgradeLegacyMedia(context.messages))


function upgradeLegacyMedia(input: Info["messages"]) {
  if (!Array.isArray(input)) return input
  return input.map((message: unknown) => {
    if (!Predicate.isObject(message) || !Array.isArray(message.content)) return message
    return {
      ...message,
      content: message.content.map((part: unknown) => {
        if (
          !Predicate.isObject(part) ||
          part.type !== "media" ||
          part.media !== undefined ||
          typeof part.mediaType !== "string" ||
          typeof part.data !== "string"
        )
          return part
        const { mediaType, data, ...rest } = part
        return { ...rest, media: { source: { type: "base64", data, mediaType } } }
      }),
    }
  })
}

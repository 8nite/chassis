import { Effect, Schema } from "effect"
import { Base64 } from "effect/encoding"
import type { MediaPart } from "../../schema/index.js"
import { ProviderShared } from "../shared.js"



export const ImageFormat = Schema.Literals(["png", "jpeg", "gif", "webp"])
export type ImageFormat = Schema.Schema.Type<typeof ImageFormat>

export const ImageBlock = Schema.Struct({
  image: Schema.Struct({
    format: ImageFormat,
    source: Schema.Struct({ bytes: Schema.String }),
  }),
})
export type ImageBlock = Schema.Schema.Type<typeof ImageBlock>



export const DocumentFormat = Schema.Literals(["pdf", "csv", "doc", "docx", "xls", "xlsx", "html", "txt", "md"])
export type DocumentFormat = Schema.Schema.Type<typeof DocumentFormat>

export const DocumentBlock = Schema.Struct({
  document: Schema.Struct({
    format: DocumentFormat,
    name: Schema.String,
    source: Schema.Struct({ bytes: Schema.String }),
  }),
})
export type DocumentBlock = Schema.Schema.Type<typeof DocumentBlock>

const IMAGE_FORMATS = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/gif": "gif",
  "image/webp": "webp",
} as const satisfies Record<string, ImageFormat>

const DOCUMENT_FORMATS = {
  "application/pdf": "pdf",
  "text/csv": "csv",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/html": "html",
  "text/plain": "txt",
  "text/markdown": "md",
} as const satisfies Record<string, DocumentFormat>

const documentBlock = (name: string, format: DocumentFormat, bytes: string): DocumentBlock => ({
  document: {
    format,
    name,
    source: { bytes },
  },
})

function documentName(filename: string | undefined, names: Set<string>) {
  const base =
    (filename ?? "")
      .replace(/\.[^.]*$/, "")
      .replace(/[^a-zA-Z0-9 ()[\]-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200)
      .trim() || "document"
  let name = base
  
  for (let index = 2; names.has(name); index++) {
    const suffix = ` ${index}`
    name = `${base.slice(0, 200 - suffix.length).trimEnd()}${suffix}`
  }
  names.add(name)
  return name
}

const mediaBase64 = Effect.fnUntraced(function* (part: MediaPart) {
  const media = yield* ProviderShared.requireInlineMedia("Bedrock Converse", part.media)
  const bytes = yield* Effect.fromResult(Base64.decode(media.base64)).pipe(
    Effect.mapError((cause) =>
      ProviderShared.invalidRequest("Bedrock Converse media data must be valid base64", cause),
    ),
  )
  return Base64.encode(bytes)
})






export const lower = Effect.fnUntraced(function* (part: MediaPart, documentNames: Set<string>) {
  const mime = part.media.mediaType.toLowerCase()
  const imageFormat = IMAGE_FORMATS[mime as keyof typeof IMAGE_FORMATS]
  if (imageFormat) {
    return [{ image: { format: imageFormat, source: { bytes: yield* mediaBase64(part) } } } satisfies ImageBlock]
  }
  if (mime.startsWith("image/"))
    return yield* ProviderShared.invalidRequest(
      `Bedrock Converse does not support image media type ${part.media.mediaType}`,
    )
  const documentFormat = DOCUMENT_FORMATS[mime as keyof typeof DOCUMENT_FORMATS]
  if (documentFormat) {
    const name = documentName(part.filename, documentNames)
    const block = documentBlock(name, documentFormat, yield* mediaBase64(part))
    return part.filename !== undefined && part.filename !== name
      ? [
          {
            text: `Attached file ${ProviderShared.encodeJson(part.filename)} has document label ${ProviderShared.encodeJson(name)}.`,
          },
          block,
        ]
      : [block]
  }
  return yield* ProviderShared.invalidRequest(`Bedrock Converse does not support media type ${part.media.mediaType}`)
})

export * as BedrockMedia from "./bedrock-media.js"

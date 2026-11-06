import { artifactKind, artifactMime, type ArtifactKind } from "@chassis/util/artifact"
import { bytesToBase64 } from "@chassis/util/base64"
import type { FileContent } from "@/runtime/server/types"


const binaryKinds = new Set<ArtifactKind>([
  "image",
  "audio",
  "video",
  "pdf",
  "font",
  "document",
  "spreadsheet",
  "presentation",
])


function isBinaryBytes(bytes: Uint8Array) {
  return bytes.subarray(0, 8192).includes(0)
}


export const MAX_MEDIA_BYTES = 25 * 1024 * 1024

export function fileContentFromBytes(path: string, bytes: Uint8Array): FileContent {
  const kind = artifactKind(path)
  const mimeType = artifactMime(path)

  if (binaryKinds.has(kind)) {
    if (bytes.length > MAX_MEDIA_BYTES) return { type: "binary", content: "", size: bytes.length }

    return { type: "binary", content: bytesToBase64(bytes), encoding: "base64", mimeType }
  }

  
  if (kind === "text" && isBinaryBytes(bytes)) return { type: "binary", content: "", size: bytes.length }

  return { type: "text", content: new TextDecoder().decode(bytes), mimeType }
}

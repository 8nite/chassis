import { encodeFilePath } from "@chassis/util/path"
import type { Files } from "../sdk"


export function workspaceFileURL(files: Files, path: string) {
  return `file://${encodeFilePath(`${files.root.replaceAll("\\", "/").replace(/\/+$/, "")}/${path}`)}`
}

import { bundledLanguagesInfo } from "shiki"
import { getFilename } from "@chassis/util/path"
import type { PromptFileAttachment } from "@chassis/client/promise"

export function attached(file: PromptFileAttachment) {
  if (file.mention) return false

  if (file.source.type === "inline") return true

  return file.source.uri.startsWith("data:")
}


const LANGUAGE_NAMES = new Map<string, string>(
  bundledLanguagesInfo.flatMap((info) =>
    [info.id, ...(info.aliases ?? [])].map((alias) => [alias, info.name] as [string, string]),
  ),
)



export function typeLabel(filename: string, mime: string, fallback: string) {
  if (mime === "application/pdf") return "PDF"
  const base = getFilename(filename)
  
  const idx = base.lastIndexOf(".")
  const suffix = idx <= 0 ? "" : base.slice(idx + 1).toLowerCase()

  if (!suffix) return fallback

  return LANGUAGE_NAMES.get(suffix) ?? suffix.toUpperCase()
}

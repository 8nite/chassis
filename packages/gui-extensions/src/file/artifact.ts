import { base64ToBytes } from "@chassis/util/base64"
import type { FileContent } from "../sdk"


export function contentBytes(content: FileContent) {
  if (content.size !== undefined) return content.size

  if (content.encoding === "base64") {
    const padding = content.content.endsWith("==") ? 2 : content.content.endsWith("=") ? 1 : 0

    return Math.floor((content.content.length * 3) / 4) - padding
  }

  return new TextEncoder().encode(content.content).length
}


export function parseDelimited(text: string, delimiter: string, limit = 1000) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  let total = 0

  const endRow = () => {
    row.push(field)
    field = ""
    const blank = row.length === 1 && row[0] === ""

    if (!blank) {
      total++

      if (rows.length < limit) rows.push(row)
    }

    row = []
  }

  for (let index = 0; index < text.length; index++) {
    const char = text[index]!

    if (quoted) {
      if (char !== '"') {
        field += char
        continue
      }

      if (text[index + 1] === '"') {
        field += '"'
        index++
        continue
      }

      quoted = false
      continue
    }

    if (char === '"' && field === "") {
      quoted = true
      continue
    }

    if (char === delimiter) {
      row.push(field)
      field = ""
      continue
    }

    if (char === "\r") continue

    if (char === "\n") {
      endRow()
      continue
    }

    field += char
  }

  if (field !== "" || row.length > 0) endRow()
  const columns = rows.reduce((max, current) => Math.max(max, current.length), 0)

  return { rows, total, columns }
}


export function bytesFromContent(content: FileContent) {
  if (content.encoding !== "base64") return new TextEncoder().encode(content.content)

  return base64ToBytes(content.content)
}


export function blobUrlFromContent(content: FileContent) {
  const type = content.mimeType ?? "application/octet-stream"

  if (content.encoding !== "base64") return URL.createObjectURL(new Blob([content.content], { type }))

  return URL.createObjectURL(new Blob([bytesFromContent(content)], { type }))
}


export function resolveArtifactPath(base: string, href: string) {
  const target = href.replaceAll("\\", "/")

  if (target.startsWith("/")) return undefined
  const dir = base.replaceAll("\\", "/")
  const segments = [...dir.split("/").filter(Boolean)]

  for (const segment of target.split("/")) {
    if (!segment || segment === ".") continue

    if (segment !== "..") {
      segments.push(segment)
      continue
    }

    if (segments.length === 0) return undefined
    segments.pop()
  }

  return `${dir.startsWith("/") ? "/" : ""}${segments.join("/")}`
}

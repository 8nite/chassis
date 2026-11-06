import { parsePathLineSuffix } from "@chassis/util/path"


const fileNames = new Set([
  "CHANGELOG",
  "CODEOWNERS",
  "Containerfile",
  "Dockerfile",
  "Gemfile",
  "Justfile",
  "LICENSE",
  "Makefile",
  "Procfile",
  "README",
  "Rakefile",
  "Vagrantfile",
])


export function inlineCodeKind(text: string): "path" | "url" | undefined {
  if (/^https?:\/\//i.test(text)) return "url"

  if (!text || /\s/.test(text) || /^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return

  
  if (/[{}<>"'`;=|&*,]/.test(text)) return

  
  if (/^[\\/]{2}/.test(text)) return

  const path = parsePathLineSuffix(text).path

  if (fileNames.has(path)) return "path"

  if (/[./\\]/.test(path) && /[a-z]/i.test(path)) return "path"
}

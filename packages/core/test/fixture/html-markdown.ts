import { writeSync } from "node:fs"
import { convertHTMLToMarkdown } from "../../src/tool/html-markdown"

const html = await Bun.stdin.text()

writeSync(1, "ready\n")
await Bun.write(Bun.stdout, convertHTMLToMarkdown(html))

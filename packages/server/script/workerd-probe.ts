#!/usr/bin/env bun

import path from "node:path"
import { mkdtempSync } from "node:fs"
import os from "node:os"

const outdir = mkdtempSync(path.join(os.tmpdir(), "chassis-workerd-probe-"))
const result = await Bun.build({
  entrypoints: [path.join(import.meta.dir, "../src/workerd.ts")],
  conditions: ["workerd"],
  target: "node",
  outdir,
  sourcemap: "none",
  throw: false,
})

if (!result.success) {
  console.error(`workerd bundle probe FAILED (${result.logs.length} issues)`)
  for (const log of result.logs) console.error(String(log))
  process.exit(1)
}






const transpiler = new Bun.Transpiler({ loader: "js" })
const externals = new Map<string, { static: boolean }>()
const record = (specifier: string, isStatic: boolean) => {
  const seen = externals.get(specifier)
  externals.set(specifier, { static: (seen?.static ?? false) || isStatic })
}
for (const artifact of result.outputs) {
  const text = await artifact.text()
  for (const imported of transpiler.scanImports(text)) record(imported.path, imported.kind !== "dynamic-import")
  for (const match of text.matchAll(/\brequire\(\s*"([^"]+)"\s*\)/g)) record(match[1], true)
}
const sorted = Array.from(externals.keys()).toSorted()
const isBun = (specifier: string) => specifier === "bun" || specifier.startsWith("bun:")
const leaked = sorted.filter((specifier) => isBun(specifier) && externals.get(specifier)!.static)
const bytes = result.outputs.reduce((total, artifact) => total + artifact.size, 0)

console.log(`workerd bundle probe OK: ${result.outputs.length} artifacts, ${(bytes / 1024 / 1024).toFixed(1)} MiB`)
console.log(`external builtins (${sorted.length}):`)
for (const specifier of sorted) {
  const lazy = externals.get(specifier)!.static ? "" : " (lazy)"
  console.log(`  ${specifier}${lazy}`)
}
if (leaked.length > 0) {
  console.error(`FAILED: bun builtins statically imported in the workerd graph: ${leaked.join(", ")}`)
  process.exit(1)
}

#!/usr/bin/env bun

const source = process.env.CHASSIS_MODELS_URL || "https://models."
const response = await fetch(`${source}/api.json`)
if (!response.ok) {
  console.error(`Failed to fetch ${source}/api.json: ${response.status} ${response.statusText}`)
  process.exit(1)
}
const text = await response.text()
const parsed: unknown = JSON.parse(text)


const MINIMUM_PROVIDERS = 100
if (typeof parsed !== "object" || parsed === null || Object.keys(parsed).length < MINIMUM_PROVIDERS) {
  console.error(`Fetched catalog has fewer than ${MINIMUM_PROVIDERS} providers; refusing to write snapshot`)
  process.exit(1)
}
const target = new URL("../src/models-dev/snapshot.txt", import.meta.url)
await Bun.write(target, text)
console.log(`Wrote ${Object.keys(parsed).length} providers (${text.length} bytes) to ${Bun.fileURLToPath(target)}`)

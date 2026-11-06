import { destinationOrigin } from "./policy"


const SEARCH = "https://www.google.com/search?q="


export function resolveAddress(input: string) {
  const value = input.trim()

  if (!value || value.toLowerCase() === "about:blank") return "about:blank"

  return searches(value) ? `${SEARCH}${encodeURIComponent(value)}` : value
}


export function searches(input: string) {
  const value = input.trim()

  if (!value || /^about:\S*$/i.test(value)) return false

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) return !URL.canParse(value)

  if (/\s/.test(value)) return true
  const host = value.split(/[/?#]/, 1)[0] ?? ""

  const named =
    /^(?:localhost|\[[\da-f:.]+\])(?::\d+)?$/i.test(host) || /:\d+$/.test(host) || /^[^.]+(?:\.[^.]+)+$/.test(host)

  
  return !named || !destinationOrigin(`https://${value}`)
}


export function addressParts(url: string) {
  const match = /^([a-z][a-z\d+.-]*:\/\/)?([^/?#]*)(.*)$/is.exec(url)

  return { scheme: match?.[1] ?? "", host: match?.[2] ?? url, rest: match?.[3] ?? "" }
}


export function connection(url: string) {
  if (!URL.canParse(url)) return
  const parsed = new URL(url)

  if (parsed.protocol === "https:") return "secure"

  if (parsed.protocol === "file:") return "file"

  if (parsed.protocol !== "http:") return

  return loopback(parsed.hostname) ? "local" : "insecure"
}


export function loopback(hostname: string) {
  return /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)$/i.test(hostname) || hostname.endsWith(".localhost")
}

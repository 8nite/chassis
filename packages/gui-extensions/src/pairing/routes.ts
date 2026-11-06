
export type RouteKind = "custom" | "local" | "vpn" | "other"


export type PairingRoute = { readonly url: string; readonly kind: RouteKind }

const order: Record<RouteKind, number> = { custom: 0, local: 1, vpn: 2, other: 3 }


export function pairingRoutes(urls: readonly string[], custom: string) {
  const advertised = urls.flatMap((value): PairingRoute[] => {
    const url = URL.parse(value)
    const kind = url ? routeKind(url.hostname) : undefined

    return url && kind ? [{ url: url.origin, kind }] : []
  })

  
  const origin = customAddress(custom)
  const routes: PairingRoute[] = origin ? [{ url: origin, kind: "custom" }, ...advertised] : advertised

  return routes
    .filter((route, index) => routes.findIndex((other) => other.url === route.url) === index)
    .toSorted((a, b) => order[a.kind] - order[b.kind] || Number(linkLocal(a.url)) - Number(linkLocal(b.url)))
}


export function customAddress(value: string) {
  const url = URL.parse(value.trim())

  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) return

  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return

  return url.origin
}


function linkLocal(url: string) {
  return new URL(url).hostname.startsWith("169.254.")
}

function routeKind(hostname: string): RouteKind | undefined {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase()

  if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "::") return

  
  if (/^(127|0)\./.test(host) || host.startsWith("fe80:")) return

  
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) || host.startsWith("fd7a:115c:a1e0:")) return "vpn"

  
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(host) || /^f[cd][0-9a-f]{2}:/.test(host))
    return "local"

  return "other"
}







export type PlacementKind = "prepend" | "append" | "before" | "after" | "replace"




export type Placement = { readonly kind: PlacementKind; readonly target: string }


export type Claim<Render> = {
  readonly key: string
  readonly plugin: string
  readonly placement: Placement
  readonly render: Render
}



export type Slotted<Render> = {
  readonly before: ReadonlyArray<Claim<Render>>
  readonly prepend: ReadonlyArray<Claim<Render>>
  readonly append: ReadonlyArray<Claim<Render>>
  readonly after: ReadonlyArray<Claim<Render>>
  readonly replace?: Claim<Render>
}

export type Suppressed<Render> = {
  readonly claim: Claim<Render>
  
  
  readonly by?: Claim<Render>
}

export type Degraded<Render> = {
  readonly claim: Claim<Render>
  
  readonly to: string
}

const EMPTY: Slotted<never> = { before: [], prepend: [], append: [], after: [] }

export function emptySlotted<Render>(): Slotted<Render> {
  return EMPTY
}



export function contains(ancestor: string, path: string) {
  return path.startsWith(ancestor + ".")
}




export function resolveSlots<Render>(input: {
  readonly paths: ReadonlySet<string>
  readonly claims: ReadonlyArray<Claim<Render>>
}): {
  readonly slotted: ReadonlyMap<string, Slotted<Render>>
  readonly suppressed: ReadonlyArray<Suppressed<Render>>
  readonly degraded: ReadonlyArray<Degraded<Render>>
} {
  const suppressed: Suppressed<Render>[] = []
  const degraded: Degraded<Render>[] = []

  
  
  
  const winners = new Map<string, Claim<Render>>()
  for (const claim of input.claims) {
    if (claim.placement.kind !== "replace") continue
    if (!input.paths.has(claim.placement.target)) {
      suppressed.push({ claim })
      continue
    }
    const prior = winners.get(claim.placement.target)
    if (prior) suppressed.push({ claim: prior, by: claim })
    winners.set(claim.placement.target, claim)
  }
  const boundaries = new Map<string, Claim<Render>>()
  const containing = (path: string) => {
    for (const [boundary, winner] of boundaries) if (contains(boundary, path)) return winner
    return undefined
  }
  
  for (const [path, winner] of [...winners].sort((a, b) => depth(a[0]) - depth(b[0]))) {
    const outer = containing(path)
    if (outer) {
      suppressed.push({ claim: winner, by: outer })
      continue
    }
    boundaries.set(path, winner)
  }

  
  
  
  const buckets = new Map<
    string,
    { before: Claim<Render>[]; prepend: Claim<Render>[]; append: Claim<Render>[]; after: Claim<Render>[] }
  >()
  const bucket = (path: string) => {
    const existing = buckets.get(path)
    if (existing) return existing
    const fresh = { before: [], prepend: [], append: [], after: [] }
    buckets.set(path, fresh)
    return fresh
  }
  for (const claim of input.claims) {
    const kind = claim.placement.kind
    if (kind === "replace") continue
    const target = claim.placement.target
    
    
    const inside = kind === "prepend" || kind === "append" ? boundaries.get(target) : undefined
    const outer = inside ?? containing(target)
    if (outer) {
      suppressed.push({ claim, by: outer })
      continue
    }
    if (input.paths.has(target)) {
      bucket(target)[kind].push(claim)
      continue
    }
    const ancestor = survivingAncestor(target, input.paths)
    if (ancestor === undefined) {
      suppressed.push({ claim })
      continue
    }
    
    
    
    
    degraded.push({ claim, to: ancestor })
    bucket(ancestor).append.push(claim)
  }

  const slotted = new Map<string, Slotted<Render>>()
  for (const [path, lists] of buckets) slotted.set(path, lists)
  for (const [path, winner] of boundaries) slotted.set(path, { ...(buckets.get(path) ?? EMPTY), replace: winner })
  return { slotted, suppressed, degraded }
}

function depth(path: string) {
  return path.split(".").length
}

function survivingAncestor(path: string, paths: ReadonlySet<string>) {
  for (let index = path.lastIndexOf("."); index !== -1; index = path.lastIndexOf(".", index - 1)) {
    const ancestor = path.slice(0, index)
    if (paths.has(ancestor)) return ancestor
  }
  return undefined
}

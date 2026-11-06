import { Schema } from "effect"


export const Visit = Schema.Struct({
  url: Schema.String,
  title: Schema.String,
  
  icon: Schema.optionalKey(Schema.String),
})

export type Visit = typeof Visit.Type

export const History = Schema.Struct({ visits: Schema.Array(Visit) })

export type History = typeof History.Type


const MAX_VISITS = 30


const MAX_STORED_ICON = 6_000


export function recordable(url: string) {
  return /^(?:https?|file):\/\//i.test(url)
}


export function remember(visits: readonly Visit[], visit: Pick<Visit, "url" | "title">, icon?: string): Visit[] {
  const earlier = visits.find((item) => item.url === visit.url)
  const kept = storable(icon) ?? earlier?.icon
  const title = visit.title || earlier?.title || ""

  const next: Visit = kept ? { url: visit.url, title, icon: kept } : { url: visit.url, title }

  
  return [next, ...visits.flatMap((item) => (item.url === visit.url ? [] : [{ ...item }]))].slice(0, MAX_VISITS)
}


export function withIcon(visits: readonly Visit[], url: string, icon: string) {
  const stored = storable(icon)

  if (!stored || !visits.some((visit) => visit.url === url && visit.icon !== stored)) return

  return visits.map((visit) => (visit.url === url ? { ...visit, icon: stored } : { ...visit }))
}

function storable(icon: string | undefined) {
  return icon && icon.length <= MAX_STORED_ICON ? icon : undefined
}


export function suggest(visits: readonly Visit[], query: string, limit: number) {
  const needle = query.trim().toLowerCase()

  if (!needle) return []

  const matches = visits.filter(
    (visit) => bare(visit.url).toLowerCase().includes(needle) || visit.title.toLowerCase().includes(needle),
  )

  return [
    ...matches.filter((visit) => completes(visit, needle)),
    ...matches.filter((visit) => !completes(visit, needle)),
  ].slice(0, limit)
}


export function completes(visit: Visit, query: string) {
  const needle = query.trim().toLowerCase()

  return !!needle && bare(visit.url).toLowerCase().startsWith(needle)
}


export function highlight(text: string, query: string) {
  const needle = query.trim().toLowerCase()

  if (!needle) return [{ text, match: false }]
  const lower = text.toLowerCase()

  const starts = Array.from(lower.matchAll(new RegExp(escape(needle), "g")), (found) => found.index)
  const bounds = starts.flatMap((start) => [start, start + needle.length])

  return [0, ...bounds, text.length].flatMap((start, index, all) => {
    const end = all[index + 1]

    return end === undefined || end === start ? [] : [{ text: text.slice(start, end), match: index % 2 === 1 }]
  })
}


export function bare(url: string) {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "")
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

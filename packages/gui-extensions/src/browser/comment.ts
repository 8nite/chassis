import { Browser } from "@chassis/plugin-browser/rpc"
import { Schema } from "effect"
import type { ComposerNote } from "../sdk"
import type { PaneElement } from "./ipc"


export type ElementComment = {
  origin: string
  tabID: Browser.TabID
  url: string
  element: Omit<PaneElement, "rect" | "ref"> & { ref?: Browser.Ref }
  comment: string
}


type NoteHref = { readonly tabID: Browser.TabID; readonly ref?: Browser.Ref }

const isTab = Schema.is(Browser.TabID)

const isRef = Schema.is(Browser.Ref)


export function commentNote(input: ElementComment): ComposerNote {
  const ref = input.element.ref

  const note: ComposerNote = {
    type: "note",
    origin: input.origin,
    commentID: crypto.randomUUID(),
    label: input.element.label,
    icon: "select-element",
    subject: subject(input),
    comment: input.comment,
    href: input.tabID,
  }

  return ref ? { ...note, live: { subject: subject(input, ref), href: `${input.tabID}#${ref}` } } : note
}


export function pageNote(input: {
  origin: string
  tabID: Browser.TabID
  url: string
  title: string
  label: string
  comment: string
}): ComposerNote {
  
  const title = input.title ? ` titled ${JSON.stringify(input.title)}` : ""

  return {
    type: "note",
    origin: input.origin,
    commentID: crypto.randomUUID(),
    label: input.label,
    icon: "outline-globe",
    subject: `the page in browser tab ${input.tabID} at ${input.url}${title}`,
    comment: input.comment,
    href: input.tabID,
  }
}


export function readHref(href: string): NoteHref | undefined {
  const [tabID, ref] = href.split("#")

  if (!isTab(tabID)) return

  return ref && isRef(ref) ? { tabID, ref } : { tabID }
}

function subject(input: ElementComment, ref?: string) {
  const element = input.element

  
  const details = [
    element.role ? `role ${element.role}` : undefined,
    element.name ? `accessible name ${JSON.stringify(element.name)}` : undefined,
    element.text && element.text !== element.name ? `text ${JSON.stringify(element.text.slice(0, 80))}` : undefined,
    
    element.selector
      ? `selector ${JSON.stringify(element.selector)}${element.selector.includes(" >>> ") ? ' (">>>" enters a shadow root)' : ""}`
      : undefined,
    ref
      ? `browser ref @${ref}, usable as ref in any browser tool including browser.evaluate until the page navigates`
      : undefined,
  ].filter((detail) => detail !== undefined)

  return `the ${JSON.stringify(element.label)} element in browser tab ${input.tabID} at ${input.url}${details.length ? ` (${details.join("; ")})` : ""}`
}

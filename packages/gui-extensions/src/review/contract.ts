import type { FileDiffInfo } from "@chassis/client/promise"
import { Contract, type SessionRef, type SessionScreen } from "../sdk"

export type ChangeKind = "add" | "del" | "mix"


export interface Changes {
  
  diffs(session: SessionRef): readonly FileDiffInfo[]
  
  ready(session: SessionRef): boolean
  
  kinds(session: SessionRef): ReadonlyMap<string, ChangeKind>
  
  active(session: SessionRef): string | undefined
  
  details(session: SessionRef): readonly FileDiffInfo[] | undefined
  
  focus(session: SessionRef, path: string): void
  
  open(session: SessionRef): void
  
  watch(screen: SessionScreen, source: "tree" | "files" | "details"): () => void
  
  onReveal(listener: () => void): () => void
}


export const Changes = Contract.define<Changes, "review.changes">("review.changes")
